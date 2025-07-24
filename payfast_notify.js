const express = require("express");
const crypto = require("crypto");
const axios = require("axios");
const dns = require("dns");
const admin = require("firebase-admin");
const bodyParser = require("body-parser");
const app = express();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const testingMode = true;
const pfHost = testingMode ? "sandbox.payfast.co.za" : "www.payfast.co.za";
const passPhrase = "jt7NOE43FZPn"; // Your PayFast passphrase

// Initialize Firebase Admin
const serviceAccount = require("./serviceAccountKey.json"); // download this from Firebase console

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://pakbet-b0abe-default-rtdb.firebaseio.com"
});

const db = admin.database();

// Helpers
const generateSignature = (data, passPhrase = null) => {
  let pfOutput = "";
  for (let key in data) {
    if (data.hasOwnProperty(key) && data[key] !== "" && key !== "signature") {
      pfOutput += `${key}=${encodeURIComponent(data[key].trim()).replace(/%20/g, "+")}&`;
    }
  }

  let getString = pfOutput.slice(0, -1);
  if (passPhrase !== null) {
    getString += `&passphrase=${encodeURIComponent(passPhrase.trim()).replace(/%20/g, "+")}`;
  }

  return crypto.createHash("md5").update(getString).digest("hex");
};

const pfValidSignature = (pfData, pfParamString, passPhrase = null) => {
  if (passPhrase !== null) {
    pfParamString += `&passphrase=${encodeURIComponent(passPhrase.trim()).replace(/%20/g, "+")}`;
  }

  const signature = crypto.createHash("md5").update(pfParamString).digest("hex");
  return pfData["signature"] === signature;
};

async function ipLookup(domain) {
  return new Promise((resolve, reject) => {
    dns.lookup(domain, { all: true }, (err, address) => {
      if (err) {
        reject(err);
      } else {
        const addressIps = address.map((item) => item.address);
        resolve(addressIps);
      }
    });
  });
}

const pfValidIP = async (req) => {
  const validHosts = [
    "www.payfast.co.za",
    "sandbox.payfast.co.za",
    "w1w.payfast.co.za",
    "w2w.payfast.co.za"
  ];

  let validIps = [];
  const pfIp = req.headers["x-forwarded-for"] || req.connection.remoteAddress;

  for (let host of validHosts) {
    const ips = await ipLookup(host);
    validIps = [...validIps, ...ips];
  }

  const uniqueIps = [...new Set(validIps)];
  return uniqueIps.includes(pfIp);
};

const pfValidPaymentData = (expectedAmount, pfData) => {
  return Math.abs(parseFloat(expectedAmount) - parseFloat(pfData["amount_gross"])) <= 0.01;
};

const pfValidServerConfirmation = async (pfHost, pfParamString) => {
  try {
    const response = await axios.post(`https://${pfHost}/eng/query/validate`, pfParamString, {
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });

    return response.data.trim() === "VALID";
  } catch (error) {
    console.error("Validation request failed", error);
    return false;
  }
};

// Main Notify Route
app.post("/payfast_notify", async (req, res) => {
  const pfData = { ...req.body };

  // Build pfParamString
  let pfParamString = "";
  for (let key in pfData) {
    if (pfData.hasOwnProperty(key) && key !== "signature") {
      pfParamString += `${key}=${encodeURIComponent(pfData[key].trim()).replace(/%20/g, "+")}&`;
    }
  }
  pfParamString = pfParamString.slice(0, -1);

  const expectedAmount = pfData["amount_gross"];
  const userId = pfData["custom_str1"]; // assuming you're passing UID via custom_str1

  const check1 = pfValidSignature(pfData, pfParamString, passPhrase);
  const check2 = await pfValidIP(req);
  const check3 = pfValidPaymentData(expectedAmount, pfData);
  const check4 = await pfValidServerConfirmation(pfHost, pfParamString);

  if (check1 && check2 && check3 && check4 && pfData["payment_status"] === "COMPLETE") {
    try {
      const walletRef = db.ref(`wallets/${userId}/balance`);
      const snapshot = await walletRef.once("value");
      const currentBalance = parseFloat(snapshot.val()) || 0;

      const newBalance = currentBalance + parseFloat(expectedAmount);
      await walletRef.set(newBalance);

      // Optionally log to transactions
      await db.ref("transactions").push({
        type: "deposit",
        userId: userId,
        amount: parseFloat(expectedAmount),
        timestamp: Date.now(),
        source: "PayFast",
        status: "confirmed"
      });

      console.log("User wallet credited successfully");
      res.status(200).send("OK");
    } catch (err) {
      console.error("Error updating wallet:", err);
      res.status(500).send("FAIL");
    }
  } else {
    console.warn("PayFast verification failed");
    res.status(400).send("FAIL");
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`PayFast notify listener running on port ${PORT}`);
});
