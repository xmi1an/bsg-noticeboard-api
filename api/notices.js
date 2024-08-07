const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const https = require("https");
const cors = require("cors");

const app = express();

// Use CORS for enabling cross-origin requests
app.use(cors());

const IMAGE_DIR = path.join(__dirname, "../public/static");
if (!fs.existsSync(IMAGE_DIR)) {
  fs.mkdirSync(IMAGE_DIR, { recursive: true });
}

const saveBase64Image = async (base64Data, filename) => {
  const imageData = Buffer.from(base64Data, "base64");
  const filepath = path.join(IMAGE_DIR, filename);
  await fs.promises.writeFile(filepath, imageData);
  return filename;
};

// Serve static files
app.use("/static", express.static(IMAGE_DIR));

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

app.get("/api/v1/notices", async (req, res) => {
  console.log("Request received");
  const url = "https://bisag-n.gov.in/";

  try {
    const response = await axios.get(url, { httpsAgent });
    const html = response.data;
    const $ = cheerio.load(html);

    const section = $("#noticeboard");
    if (!section.length) {
      console.error(`Section with id 'noticeboard' not found`);
      return res
        .status(404)
        .json({ error: "Section with id 'noticeboard' not found" });
    }

    const table = section.find("table");
    if (!table.length) {
      console.error(`Table within the section 'noticeboard' not found`);
      return res
        .status(404)
        .json({ error: "Table within the section 'noticeboard' not found" });
    }

    const rows = table.find("tr").slice(1);
    const notices = [];

    for (const row of rows) {
      const columns = $(row).find("td");
      if (columns.length < 4) {
        console.warn("Row with insufficient columns found");
        continue;
      }

      try {
        const publishDate = $(columns[0]).text().trim();
        const subjectElement = $(columns[1]);
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

        const lastDate = $(columns[2]).text().trim();
        const applyLinkAnchor = $(columns[3]).find("a");
        const applyLink = applyLinkAnchor.attr("href") || null;

        const notice = {
          publish_date: publishDate,
          subject: subjectText,
          subject_link: imageUrl,
          last_date: lastDate,
          apply_link: applyLink,
        };
        notices.push(notice);
      } catch (error) {
        console.error("Error processing row:", error);
      }
    }

    console.log("Response successfully generated");
    return res.json(notices);
  } catch (error) {
    console.error("Request failed:", error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = app;
