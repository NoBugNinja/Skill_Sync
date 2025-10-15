const express = require("express");
const cors = require("cors");
const natural = require("natural");

const app = express();
const port = 5000;

app.use(cors());

app.use(express.json());

const stemmer = natural.PorterStemmer;

app.post("/analyze", (req, res) => {
  console.log(
    `[${new Date().toLocaleTimeString()}] Received request to /analyze`
  );
  const { resumeText, keywords } = req.body;

  if (!resumeText || !keywords) {
    return res.status(400).json({ error: "Missing data" });
  }

  const tokenizer = new natural.WordTokenizer();
  const resumeTokens = tokenizer.tokenize(resumeText.toLowerCase());
  const resumeStems = new Set(resumeTokens.map((token) => stemmer.stem(token)));

  const findStemMatches = (keywordList) => {
    const matched = new Set();
    for (const keyword of keywordList) {
      const keywordStem = stemmer.stem(keyword.toLowerCase().split(" ").pop());

      if (resumeStems.has(keywordStem)) {
        matched.add(keyword);
      }
    }
    return Array.from(matched);
  };

  const matchedMustHave = findStemMatches(keywords.mustHave || []);
  const matchedNiceToHave = findStemMatches(keywords.niceToHave || []);

  const MUST_HAVE_WEIGHT = 3;
  const NICE_TO_HAVE_WEIGHT = 1;

  const score =
    matchedMustHave.length * MUST_HAVE_WEIGHT +
    matchedNiceToHave.length * NICE_TO_HAVE_WEIGHT;
  const maxScore =
    (keywords.mustHave || []).length * MUST_HAVE_WEIGHT +
    (keywords.niceToHave || []).length * NICE_TO_HAVE_WEIGHT;
  const percentage = maxScore > 0 ? (score / maxScore) * 100 : 0;

  res.json({
    weightedScore: score,
    maxScore: maxScore,
    percentage: Math.round(percentage),
    matchedMustHave: matchedMustHave,
    matchedNiceToHave: matchedNiceToHave,
  });
});

app.listen(port, () => {
  console.log(`Starting Node.js NLP server at http://127.0.0.1:${port}`);
});
