const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const https = require("https");
const cors = require("cors");

const app = express();

// Use CORS for enabling cross-origin requests.
app.use(cors());

const IMAGE_DIR = "/tmp/static"; // Change this to a writable directory
if (!fs.existsSync(IMAGE_DIR)) {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
}

const saveBase64Image = async (base64Data, filename) => {
  const imageData = Buffer.from(base64Data, "base64");
  const filepath = path.join(IMAGE_DIR, filename);
  await fs.promises.writeFile(filepath, imageData);
  return filename;
};

// Serve static files.
app.use("/static", express.static(IMAGE_DIR));

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const scrapeNotices = async (url) => {
  const response = await axios.get(url, { httpsAgent });
  const html = response.data;
  const $ = cheerio.load(html);

  const rows = $("#noticeboard table tr").slice(1).toArray(); // Convert cheerio object to array.
  return rows;
};

const processRow = async (row) => {
  const $row = cheerio.load(row);
  const columns = $row("td");

  if (columns.length < 4) {
    return null; // Skip rows with insufficient columns.
  }

  try {
    const publishDate = $row(columns[0]).text().trim();
    const subjectElement = $row(columns[1]);
    const subjectAnchor = subjectElement.find("a");
    const subjectText = subjectAnchor.length
      ? subjectAnchor.text().trim()
      : subjectElement.text().trim();
    const subjectLink = subjectAnchor.attr("href") || null;

    let imageUrl = subjectLink;
    if (subjectLink && subjectLink.startsWith("data:image")) {
      const base64Image = subjectLink.split(",")[1];
      const hashDigest = crypto
        .createHash("md5")
        .update(base64Image)
        .digest("hex");
      const filename = `${hashDigest}.jpg`;
      await saveBase64Image(base64Image, filename);
      imageUrl = `/static/${filename}`;
    } else if (!subjectAnchor.length) {
      imageUrl = null;
    }

    const lastDate = $row(columns[2]).text().trim();
    const applyLinkAnchor = $row(columns[3]).find("a");
    const applyLink = applyLinkAnchor.attr("href") || null;

    return {
      publish_date: publishDate,
      subject: subjectText,
      subject_link: imageUrl,
      last_date: lastDate,
      apply_link: applyLink,
    };
  } catch (error) {
    console.error("Error processing row:", error);
    return null; // Skip rows that produce errors.
  }
};

app.get("/api/v1/notices", async (req, res) => {
  console.log("Request received");
  const url = "https://bisag-n.gov.in/";

  try {
    const rows = await scrapeNotices(url);

    // Process rows in parallel.
    const results = await Promise.all(rows.map((row) => processRow(row)));

    // Filter out null results.
    const notices = results.filter((notice) => notice !== null);

    console.log("Response successfully generated");

    // Return the results.
    return res.json(notices);
  } catch (error) {
    console.error("Request failed:", error);
    return res.status(500).json({ error: error.message });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
