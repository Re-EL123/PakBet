const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const dns = require('dns');
const app = express();
const PORT = 3000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const pfHost = "sandbox.payfast.co.za"; // Use "www.payfast.co.za" for live
const merchantId = "31098799";
const passphrase = "jt7NOE43FZPn";

// STEP 1: Validate Signature
function generateSignature(pfData) {
  let pfParamString = "";
  Object.keys(pfData).sort().forEach(key => {
    if (key !== "signature" && pfData[key] !== "") {
      pfParamString += `${key}=${encodeURIComponent(pfData[key].trim()).replace(/%20/g, "+")}&`;
    }
  });

  if (passphrase !== "") {
    pfParamString += `passphrase=${encodeURIComponent(passphrase).replace(/%20/g, "+")}`;
  } else {
    pfParamString = pfParamString.slice(0, -1); // remove last '&'
  }

  return crypto.createHash('md5').update(pfParamString).digest("hex");
}

// STEP 2: Validate Source IP
function validateIP(req, callback) {
  const validHosts = ['sandbox.payfast.co.za', 'www.payfast.co.za'];
  const remoteIP = req.ip || req.connection.remoteAddress;

  dns.resolve4(validHosts[0], (err, sandboxIPs) => {
    dns.resolve4(validHosts[1], (err2, liveIPs) => {
      const validIPs = [...sandboxIPs, ...liveIPs];
      callback(validIPs.includes(remoteIP));
    });
  });
}

// STEP 3 & 4: Validate merchant_id and confirm with PayFast
async function validateWithPayFast(pfData) {
  try {
    const response = await axios.post(`https://${pfHost}/eng/query/validate`, new URLSearchParams(pfData).toString(), {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    return response.data === "VALID";
  } catch (error) {
    return false;
  }
}

app.post('/payfast_notify', async (req, res) => {
  const pfData = req.body;

  // Step 1: Signature Check
  const signatureIsValid = generateSignature(pfData) === pfData.signature;
  if (!signatureIsValid) return res.status(400).send("Invalid Signature");

  // Step 2: Validate IP
  validateIP(req, async (ipIsValid) => {
    if (!ipIsValid) return res.status(403).send("Invalid IP");

    // Step 3: Check merchant_id
    if (pfData.merchant_id !== merchantId) return res.status(400).send("Merchant ID mismatch");

    // Step 4: Confirm with PayFast
    const confirmed = await validateWithPayFast(pfData);
    if (!confirmed) return res.status(400).send("PayFast validation failed");

    // ✅ If all checks pass, continue processing payment
    if (pfData.payment_status === "COMPLETE") {
      const amountPaid = parseFloat(pfData.amount_gross);
      const userId = pfData.custom_str1;

      // TODO: Credit wallet / store transaction / log, etc.
      console.log(`✅ Payment successful for User ID: ${userId}, Amount: R${amountPaid}`);
    }

    res.status(200).send("OK");
  });
});

app.listen(PORT, () => {
  console.log(`PayFast Notify server listening on port ${PORT}`);
});
