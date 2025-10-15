const mustHaveInput = document.getElementById("mustHaveKeywords");
const niceToHaveInput = document.getElementById("niceToHaveKeywords");
const resumeFilesInput = document.getElementById("resumeFiles");
const screenBtn = document.getElementById("screenBtn");
const fileChosenText = document.getElementById("file-chosen-text");
const loader = document.getElementById("loader");
const resultsContainer = document.getElementById("resultsContainer");
const dashboard = document.getElementById("dashboard");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const resumeModal = document.getElementById("resumeModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const modalFileName = document.getElementById("modalFileName");
const pdfCanvas = document.getElementById("pdf_renderer");
const highlightedTextDiv = document.getElementById("highlightedText");

let allCandidatesData = [];
let allFiles = [];

resumeFilesInput.addEventListener("change", () => {
  const numFiles = resumeFilesInput.files.length;
  fileChosenText.textContent =
    numFiles > 0 ? `${numFiles} file(s) selected` : "Choose Files";
  allFiles = Array.from(resumeFilesInput.files);
});

screenBtn.addEventListener("click", handleScreening);
exportCsvBtn.addEventListener("click", () => exportToCSV(allCandidatesData));
closeModalBtn.addEventListener("click", closeResumeModal);
resumeModal.addEventListener("click", (e) => {
  if (e.target === resumeModal) closeResumeModal();
});

async function handleScreening() {
  const keywords = getKeywords();

  if (keywords.mustHave.length === 0) {
    displayError("Please enter at least one 'Must-Have' skill.");
    return;
  }
  if (allFiles.length === 0) {
    displayError("Please upload at least one resume PDF.");
    return;
  }

  resultsContainer.innerHTML = "";
  loader.classList.remove("hidden");
  dashboard.classList.add("hidden");
  resultsContainer.innerHTML = `<div id="placeholder" class="text-center h-full flex flex-col justify-center items-center"><svg class="w-16 h-16 text-slate-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg><h3 class="text-lg font-medium text-slate-300">Your results will appear here.</h3></div>`;

  try {
    const textExtractionPromises = allFiles.map(async (file) => {
      let rawText = "";
      try {
        const typedarray = new Uint8Array(await file.arrayBuffer());
        const pdf = await pdfjsLib.getDocument({ data: typedarray }).promise;
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          rawText += textContent.items.map((item) => item.str).join(" ") + "\n";
        }
        return { fileName: file.name, rawText, error: null };
      } catch (e) {
        return {
          fileName: file.name,
          rawText: "",
          error: "Could not read this PDF.",
        };
      }
    });

    const extractedTexts = await Promise.all(textExtractionPromises);

    const analysisPromises = extractedTexts.map((resume) => {
      if (resume.error) return Promise.resolve(resume);
      return processWithNLP(resume.rawText, keywords).then((nlpResult) => ({
        ...resume,
        ...nlpResult,
      }));
    });

    allCandidatesData = await Promise.all(analysisPromises);

    allCandidatesData.sort(
      (a, b) => (b.weightedScore || 0) - (a.weightedScore || 0)
    );

    document.getElementById("placeholder")?.remove();
    displayResults(allCandidatesData, keywords);
    generateDashboard(allCandidatesData, keywords);
  } catch (error) {
    console.error("Screening error:", error);
    displayError(
      "Could not connect to the NLP server. Please ensure it is running and you don't have a network issue."
    );
  } finally {
    loader.classList.add("hidden");
  }
}

async function processWithNLP(resumeText, keywords) {
  const NLP_SERVER_URL = "http://127.0.0.1:5000/analyze";

  const response = await fetch(NLP_SERVER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resumeText, keywords }),
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`NLP server error: ${err.error || response.statusText}`);
  }

  return response.json();
}

function getKeywords() {
  const clean = (input) =>
    input.value
      .split(/[\n,]+/)
      .map((k) => k.trim())
      .filter((k) => k);
  return {
    mustHave: clean(mustHaveInput),
    niceToHave: clean(niceToHaveInput),
  };
}

function displayResults(results, keywords) {
  resultsContainer.innerHTML = "";
  results.forEach((result, index) => {
    if (result.error) {
      resultsContainer.innerHTML += createErrorCard(
        result.fileName,
        result.error
      );
      return;
    }
    const missingMustHave = keywords.mustHave.filter(
      (k) => !result.matchedMustHave.includes(k)
    );
    const missingNiceToHave = keywords.niceToHave.filter(
      (k) => !result.matchedNiceToHave.includes(k)
    );

    const card = `
            <div class="bg-slate-700/50 p-5 rounded-xl border border-slate-600">
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h3 class="text-lg font-semibold text-white flex items-center">
                            <span class="mr-3 inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-800 text-indigo-400 font-bold">${
                              index + 1
                            }</span>
                            ${escapeHTML(result.fileName)}
                        </h3>
                        <button onclick="openResumeModal(${index})" class="mt-2 text-sm text-indigo-400 hover:underline">View & Highlight Resume</button>
                    </div>
                    <div class="text-right">
                        <p class="text-xl font-bold text-white">${
                          result.percentage
                        }% Match</p>
                        <p class="text-xs text-slate-400">${
                          result.weightedScore
                        } / ${result.maxScore} Score</p>
                    </div>
                </div>
                <div class="w-full bg-slate-600 rounded-full h-2.5 mb-4"><div class="bg-indigo-500 h-2.5 rounded-full" style="width: ${
                  result.percentage
                }%"></div></div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div><h4 class="font-semibold text-indigo-400 mb-2">Matched Must-Haves</h4>${createKeywordList(
                      result.matchedMustHave,
                      "indigo"
                    )}</div>
                    <div><h4 class="font-semibold text-red-400 mb-2">Missing Must-Haves</h4>${createKeywordList(
                      missingMustHave,
                      "red"
                    )}</div>
                    <div><h4 class="font-semibold text-yellow-400 mb-2">Matched Nice-to-Haves</h4>${createKeywordList(
                      result.matchedNiceToHave,
                      "yellow"
                    )}</div>
                    <div><h4 class="font-semibold text-slate-400 mb-2">Missing Nice-to-Haves</h4>${createKeywordList(
                      missingNiceToHave,
                      "slate"
                    )}</div>
                </div>
            </div>`;
    resultsContainer.innerHTML += card;
  });
}

let commonSkillsChartInstance, scoreDistributionChartInstance;
function generateDashboard(results, keywords) {
  const validResults = results.filter((r) => !r.error);
  if (validResults.length === 0) return;

  document.getElementById("totalCandidates").textContent = validResults.length;
  const avgScore =
    validResults.reduce((sum, r) => sum + parseFloat(r.percentage), 0) /
    validResults.length;
  document.getElementById("avgMatchScore").textContent = `${avgScore.toFixed(
    0
  )}%`;

  const allMatchedSkills = validResults.flatMap((r) => [
    ...r.matchedMustHave,
    ...r.matchedNiceToHave,
  ]);
  const skillCounts = allMatchedSkills.reduce((acc, skill) => {
    acc[skill] = (acc[skill] || 0) + 1;
    return acc;
  }, {});
  const sortedSkills = Object.entries(skillCounts).sort((a, b) => b[1] - a[1]);
  document.getElementById("topSkill").textContent =
    sortedSkills.length > 0 ? sortedSkills[0][0] : "N/A";

  dashboard.classList.remove("hidden");

  const top5Skills = sortedSkills.slice(0, 5);
  const scoreBuckets = { "0-25%": 0, "26-50%": 0, "51-75%": 0, "76-100%": 0 };
  validResults.forEach((r) => {
    const p = r.percentage;
    if (p <= 25) scoreBuckets["0-25%"]++;
    else if (p <= 50) scoreBuckets["26-50%"]++;
    else if (p <= 75) scoreBuckets["51-75%"]++;
    else scoreBuckets["76-100%"]++;
  });

  if (commonSkillsChartInstance) commonSkillsChartInstance.destroy();
  commonSkillsChartInstance = new Chart(
    document.getElementById("commonSkillsChart"),
    createChartConfig(
      top5Skills.map((s) => s[0]),
      top5Skills.map((s) => s[1]),
      "bar"
    )
  );

  if (scoreDistributionChartInstance) scoreDistributionChartInstance.destroy();
  scoreDistributionChartInstance = new Chart(
    document.getElementById("scoreDistributionChart"),
    createChartConfig(
      Object.keys(scoreBuckets),
      Object.values(scoreBuckets),
      "doughnut"
    )
  );
}

let currentPdf = null;
let currentPage = 1;

async function openResumeModal(candidateIndex) {
  const candidate = allCandidatesData[candidateIndex];
  const file = allFiles.find((f) => f.name === candidate.fileName);
  if (!file) return;

  modalFileName.textContent = candidate.fileName;

  const allKeywords = [...getKeywords().mustHave, ...getKeywords().niceToHave];
  const pattern = new RegExp(
    `\\b(${allKeywords.map(escapeRegExp).join("|")})\\b`,
    "gi"
  );
  highlightedTextDiv.innerHTML = escapeHTML(candidate.rawText).replace(
    pattern,
    `<mark class="highlight">$&</mark>`
  );

  const fileReader = new FileReader();
  fileReader.onload = async function () {
    const typedarray = new Uint8Array(this.result);
    currentPdf = await pdfjsLib.getDocument(typedarray).promise;
    currentPage = 1;
    renderPage(currentPage);
  };
  fileReader.readAsArrayBuffer(file);

  resumeModal.classList.remove("opacity-0", "pointer-events-none");
  resumeModal.querySelector(".modal-content").classList.remove("scale-95");
}

function closeResumeModal() {
  resumeModal.classList.add("opacity-0", "pointer-events-none");
  resumeModal.querySelector(".modal-content").classList.add("scale-95");
  if (currentPdf) currentPdf.destroy();
  currentPdf = null;
}

async function renderPage(num) {
  if (!currentPdf) return;
  const page = await currentPdf.getPage(num);
  const viewport = page.getViewport({ scale: 1.5 });
  const context = pdfCanvas.getContext("2d");
  pdfCanvas.height = viewport.height;
  pdfCanvas.width = viewport.width;
  await page.render({ canvasContext: context, viewport: viewport }).promise;
  document.getElementById("page_num").textContent = num;
  document.getElementById("page_count").textContent = currentPdf.numPages;
}
document.getElementById("prev_page").addEventListener("click", () => {
  if (currentPage > 1) renderPage(--currentPage);
});
document.getElementById("next_page").addEventListener("click", () => {
  if (currentPdf && currentPage < currentPdf.numPages)
    renderPage(++currentPage);
});

function exportToCSV(data) {
  const headers =
    "File Name,Match %,Score,Matched Must-Haves,Matched Nice-to-Haves";
  const rows = data
    .filter((r) => !r.error)
    .map(
      (r) =>
        `"${r.fileName}",${r.percentage},${
          r.weightedScore
        },"${r.matchedMustHave.join(", ")}","${r.matchedNiceToHave.join(", ")}"`
    );
  const csvContent =
    "data:text/csv;charset=utf-8," + [headers, ...rows].join("\n");

  const link = document.createElement("a");
  link.setAttribute("href", encodeURI(csvContent));
  link.setAttribute("download", "resume_screening_results.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function createKeywordList(keywords, color) {
  const colorClasses = {
    indigo: "bg-indigo-500/20 text-indigo-300",
    red: "bg-red-500/20 text-red-300",
    yellow: "bg-yellow-500/20 text-yellow-300",
    slate: "bg-slate-500/20 text-slate-300",
  };
  if (!keywords || keywords.length === 0)
    return `<span class="text-xs text-slate-400">None</span>`;
  return `<ul class="flex flex-wrap gap-2">${keywords
    .map(
      (k) =>
        `<li class="text-xs font-medium px-2.5 py-1 rounded-full ${
          colorClasses[color]
        }">${escapeHTML(k)}</li>`
    )
    .join("")}</ul>`;
}

function displayError(message) {
  resultsContainer.innerHTML = `<div class="text-center p-8 bg-red-900/50 border border-red-700 rounded-lg"><h3 class="font-semibold text-red-300">Error</h3><p class="text-red-400 mt-2">${message}</p></div>`;
}
function createErrorCard(fileName, msg) {
  return `<div class="bg-red-900/50 p-4 rounded-xl border border-red-700"><h3 class="font-semibold text-red-300">${escapeHTML(
    fileName
  )}</h3><p class="text-sm text-red-400">${msg}</p></div>`;
}
function escapeHTML(str) {
  return str.replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[
        m
      ])
  );
}
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createChartConfig(labels, data, type) {
  const isBar = type === "bar";
  return {
    type,
    data: {
      labels,
      datasets: [
        {
          label: isBar ? "Count" : "Candidates",
          data,
          backgroundColor: isBar
            ? "rgba(99, 102, 241, 0.7)"
            : ["#4f46e5", "#38bdf8", "#34d399", "#a78bfa"],
          borderColor: isBar ? "#818cf8" : "#1e293b",
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: !isBar, labels: { color: "#cbd5e1" } } },
      scales: isBar
        ? {
            x: { ticks: { color: "#94a3b8" } },
            y: { beginAtZero: true, ticks: { color: "#94a3b8", stepSize: 1 } },
          }
        : {},
    },
  };
}
