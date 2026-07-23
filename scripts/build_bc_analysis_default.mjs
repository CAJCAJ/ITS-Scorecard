import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const legacyCsvPath = path.join(rootDir, "benefit_cost_defaults_2000_2023_mock.csv");
const outputDir = path.join(rootDir, "output", "BC_Analysis_Default");
const outputCsvPath = path.join(outputDir, "BC_Analysis_Default.csv");
const repositoryCsvPath = path.join(rootDir, "BC_Analysis_Default.csv");
const outputXlsxPath = path.join(outputDir, "BC_Analysis_Default.xlsx");
const previewPath = path.join(outputDir, "BC_Analysis_Default_preview.png");

const DATASET_VERSION = "BC_Analysis_Default_v1";
const MOCK_BENEFIT_URL = "https://www.itskrs.its.dot.gov/benefits";
const MOCK_COST_URL = "https://www.itskrs.its.dot.gov/costs";

const components = [
  {
    key: "bc_existing_mobility_benefit",
    label: "Existing Mobility Benefit",
    kind: "benefit",
    mockTechnologies: "Traffic signal control; Traffic incident management; Traveler information systems",
  },
  {
    key: "bc_existing_safety_benefit",
    label: "Existing Safety Benefit",
    kind: "benefit",
    mockTechnologies: "Traffic incident management; Work-zone ITS and queue warning; Speed management",
  },
  {
    key: "bc_existing_environment_benefit",
    label: "Existing Environmental Benefit",
    kind: "benefit",
    mockTechnologies: "Traffic signal control; Ramp metering; Traffic management center operations",
  },
  {
    key: "bc_new_mobility_benefit",
    label: "New Mobility Benefit",
    kind: "benefit",
    mockTechnologies: "Adaptive traffic signal control; Traveler information systems; Active traffic management",
  },
  {
    key: "bc_new_safety_benefit",
    label: "New Safety Benefit",
    kind: "benefit",
    mockTechnologies: "Work-zone ITS and queue warning; Variable speed limits; Emergency vehicle preemption",
  },
  {
    key: "bc_new_environment_benefit",
    label: "New Environmental Benefit",
    kind: "benefit",
    mockTechnologies: "Adaptive traffic signal control; Speed harmonization; Connected-vehicle applications",
  },
  {
    key: "bc_existing_om_cost_total",
    label: "Existing ITS O&M Cost",
    kind: "cost",
    mockTechnologies: "Traffic management centers; ITS field devices; Communications systems; Traffic signal systems",
  },
  {
    key: "bc_new_cost_total",
    label: "New ITS Deployment Cost",
    kind: "cost",
    mockTechnologies: "Traffic signal systems; Detection and surveillance; Dynamic message signs; Work-zone ITS",
  },
];

const mockMethods = {
  benefit:
    "Retained from bc_baseline_mock_v1. The legacy value modeled annual benefit growth from comparable ITS JPO findings using assumed deployment exposure; it is not a measured state-year benefit.",
  cost:
    "Retained from bc_baseline_mock_v1. The legacy value scaled ITS JPO sample unit costs and cost ranges using assumed deployment quantities and annual growth; it is not an agency expenditure record.",
};

const exactOverrides = new Map();

function setOverride(state, year, componentKey, override) {
  exactOverrides.set(`${state}|${year}|${componentKey}`, override);
}

function njReportUrl(year) {
  const filename = year === 2011 ? "statewide2011.pdf" : "statewide.pdf";
  return `https://www.nj.gov/transportation/capital/obligation/pdf/${year}/${filename}`;
}

function addNjObligation(year, componentKey, value, sourceValueNote, technologies) {
  setOverride("New Jersey", year, componentKey, {
    value,
    provenanceType: "Exact_Dataset",
    evidenceScope: "NJDOT federal authorization line item; partial coverage of statewide ITS activity",
    sourceTitle: `NJDOT FY ${year} Annual Obligation Report - Statewide`,
    sourceUrl: njReportUrl(year),
    sourcePublicationYear: year,
    sourceValueNote,
    derivationMethod:
      "Used the report's authorized amount for the explicitly identified ITS or traffic-signal program line item. This is an authorization, not a paid expenditure or lifecycle cost.",
    technologies,
    notes: "Exact reported authorization; the source does not claim that this line item is the complete statewide ITS total.",
  });
}

// NJDOT annual authorization records. O&M uses the ITS/ITS Resource Center line item;
// new deployment cost uses explicitly identified signal timing, signal replacement,
// or Intelligent Traffic Signal Systems authorizations.
addNjObligation(2009, "bc_existing_om_cost_total", 1500000, "$1.500 million authorized for Intelligent Transportation Systems (DB #03305).", "ITS architecture; ITS program support; Traffic operations center engineering support; ITS data integration");
addNjObligation(2009, "bc_new_cost_total", 1700000, "$1.700 million authorized for Traffic Signal Timing and Optimization (DB #04320).", "Traffic signal timing and optimization; Coordinated traffic signal control");
addNjObligation(2010, "bc_existing_om_cost_total", 1000000, "$1.000 million authorized for Intelligent Transportation Systems (DB #03305).", "ITS architecture; ITS program support; Traffic operations center engineering support; ITS data integration");
addNjObligation(2010, "bc_new_cost_total", 1700000, "$1.700 million authorized for Traffic Signal Timing and Optimization (DB #04320).", "Traffic signal timing and optimization; Coordinated traffic signal control");
addNjObligation(2011, "bc_existing_om_cost_total", 1500000, "$1.500 million authorized for Intelligent Transportation Systems (DB #03305).", "ITS architecture; ITS program support; Traffic operations center engineering support; ITS data integration");
addNjObligation(2012, "bc_existing_om_cost_total", 931000, "$0.931 million authorized for Intelligent Transportation Systems (DB #03305).", "ITS program support; ITS architecture; Technology evaluation");
addNjObligation(2012, "bc_new_cost_total", 2545000, "$2.545 million authorized for Traffic Signal Timing and Optimization (DB #04320).", "Traffic signal timing and optimization; Coordinated traffic signal control");
addNjObligation(2013, "bc_existing_om_cost_total", 5313000, "$5.313 million authorized under Intelligent Transportation Systems (DB #03305), including the ITS Resource Center.", "ITS Resource Center; ITS program support; Technology evaluation; Traffic operations support");
addNjObligation(2013, "bc_new_cost_total", 4838000, "$4.838 million authorized for Traffic Signal Timing and Optimization (DB #04320).", "Traffic signal timing and optimization; Coordinated traffic signal control");
addNjObligation(2014, "bc_existing_om_cost_total", 4000000, "$4.000 million authorized for the Intelligent Transportation System Resource Center (DB #13304).", "ITS Resource Center; ITS program support; Technology evaluation");
addNjObligation(2014, "bc_new_cost_total", 5148000, "$5.148 million combined authorizations explicitly listed for traffic-signal timing/optimization and Route 18 traffic-signal-system work.", "Traffic signal timing and optimization; Coordinated traffic signal control; Route 18 traffic signal system");
addNjObligation(2015, "bc_existing_om_cost_total", 3292000, "$3.292 million combined authorizations explicitly listed for the Intelligent Transportation System Resource Center.", "ITS Resource Center; ITS program support; Technology evaluation");
addNjObligation(2015, "bc_new_cost_total", 9317000, "$9.317 million authorized for Traffic Signal Replacement (DB #X47, NHPP).", "Traffic signal replacement; Signal equipment modernization");
addNjObligation(2016, "bc_existing_om_cost_total", 3264000, "$3.264 million authorized for the Intelligent Transportation System Resource Center FY 2015-2016 program.", "ITS Resource Center; ITS program support; Technology evaluation");
addNjObligation(2017, "bc_existing_om_cost_total", 3471000, "$3.471 million authorized for the Intelligent Transportation System Resource Center.", "ITS Resource Center; ITS program support; Technology evaluation");
addNjObligation(2018, "bc_existing_om_cost_total", 3694000, "$3.694 million authorized for the Intelligent Transportation System Resource Center.", "ITS Resource Center; ITS program support; Technology evaluation");
addNjObligation(2018, "bc_new_cost_total", 9301000, "$9.301 million authorized for Intelligent Traffic Signal Systems (DB #15343).", "Intelligent traffic signal systems; Traffic signal optimization; Adaptive traffic signal control");
addNjObligation(2019, "bc_existing_om_cost_total", 3836000, "$3.836 million authorized for the Intelligent Transportation System Resource Center.", "ITS Resource Center; ITS program support; Technology evaluation");
addNjObligation(2019, "bc_new_cost_total", 18022000, "$18.022 million authorized for Intelligent Traffic Signal Systems (DB #15343).", "Intelligent traffic signal systems; Adaptive traffic signal control; Arterial mobility management");
addNjObligation(2020, "bc_existing_om_cost_total", 3665000, "$3.665 million authorized for the Intelligent Transportation System Resource Center.", "ITS Resource Center; ITS program support; Technology evaluation");
addNjObligation(2020, "bc_new_cost_total", 20777000, "$20.777 million authorized for Intelligent Traffic Signal Systems (DB #15343).", "Intelligent traffic signal systems; Adaptive traffic signal control; Arterial management");
addNjObligation(2021, "bc_existing_om_cost_total", 3503000, "$3.503 million authorized for the Intelligent Transportation System Resource Center.", "ITS Resource Center; ITS program support; Technology evaluation");
addNjObligation(2021, "bc_new_cost_total", 6718000, "$6.718 million authorized for Intelligent Traffic Signal Systems (DB #15343).", "Intelligent traffic signal systems; Adaptive traffic signal control; Arterial management");
addNjObligation(2022, "bc_existing_om_cost_total", 3485000, "$3.485 million authorized for the Intelligent Transportation System Resource Center.", "ITS Resource Center; ITS program support; Technology evaluation");
addNjObligation(2023, "bc_existing_om_cost_total", 3898000, "$3.898 million authorized for the Intelligent Transportation System Resource Center (DB #13304).", "ITS Resource Center; ITS program support; Technology evaluation");
addNjObligation(2023, "bc_new_cost_total", 12092000, "$12.092 million authorized for Intelligent Traffic Signal Systems (DB #15343), Route 38/70/73 ATS Contract #1.", "Intelligent traffic signal systems; Adaptive traffic signal control; Arterial management");

setOverride("New Jersey", 2000, "bc_existing_mobility_benefit", {
  value: 70470000,
  provenanceType: "Authorized_Derived",
  evidenceScope: "New Jersey Turnpike E-ZPass deployment; project-level annual mobility benefit",
  sourceTitle: "Operational and Traffic Benefits of E-ZPass to the New Jersey Turnpike; USDOT 2026 BCA Guidance",
  sourceUrl:
    "https://www.itskrs.its.dot.gov/2007-b00421; https://www.transportation.gov/sites/dot.gov/files/2025-12/Benefit%20Cost%20Analysis%20Guidance%202026%20Update%20%28Final%29.pdf",
  sourcePublicationYear: 2001,
  sourceValueNote:
    "The evaluation reported 1.8 million passenger-car vehicle-hours and 291,000 truck vehicle-hours saved annually.",
  derivationMethod:
    "Passenger benefit = 1,800,000 vehicle-hours x 1.52 persons/vehicle x $21.80/person-hour. Truck-operator benefit = 291,000 hours x $37.20/hour. Sum = $70,470,000 in 2024 dollars; freight inventory and environmental benefits are excluded.",
  technologies: "Electronic toll collection; E-ZPass; Toll-plaza traffic management",
  notes: "Derived from authorized physical measures and USDOT national monetization factors; not a value printed directly in the deployment report.",
});

setOverride("Texas", 2000, "bc_existing_mobility_benefit", {
  value: 13994500,
  provenanceType: "Exact_Dataset",
  evidenceScope: "Houston TranStar project-level annual mobility benefits; not a statewide total",
  sourceTitle: "Estimation of Benefits of Houston TranStar",
  sourceUrl: "https://www.itskrs.its.dot.gov/2000-b00014",
  sourcePublicationYear: 1997,
  sourceValueNote:
    "$8.440 million annual incident-management delay savings plus $5.5545 million annual ramp-metering delay savings.",
  derivationMethod:
    "Summed the two non-overlapping annual mobility-benefit values reported in the ITS JPO record: $8,440,000 + $5,554,500.",
  technologies: "Traffic incident management; Ramp metering; Transportation management center operations; Traffic surveillance",
  notes: "Historical Houston deployment result represented in the 2000 row because the ITS JPO database record was posted in 2000.",
});

setOverride("Texas", 2006, "bc_new_mobility_benefit", {
  value: 577648,
  provenanceType: "Exact_Dataset",
  evidenceScope: "State Highway 6 Houston corridor; project-level annual mobility benefit",
  sourceTitle: "Adaptive Control Software - LITE Before and After Traffic Analysis Report",
  sourceUrl: "https://www.itskrs.its.dot.gov/2015-b00991",
  sourcePublicationYear: 2006,
  sourceValueNote: "$577,648 annual benefit from reduced delay, stops, and fuel consumption.",
  derivationMethod: "Used the annual benefit reported by FHWA from the before-and-after corridor evaluation.",
  technologies: "Adaptive traffic signal control; Traffic signal timing optimization; Traffic monitoring",
  notes: "Project-level result; not a statewide Texas benefit total.",
});

const texasVslSource = {
  provenanceType: "Exact_Dataset",
  evidenceScope: "Three TxDOT variable-speed-limit pilot sites; combined project-level annual estimate",
  sourceTitle: "Evaluation of TxDOT Variable Speed Limit Pilot Projects",
  sourceUrl: "https://www.itskrs.its.dot.gov/2016-b01090",
  sourcePublicationYear: 2015,
  technologies: "Variable speed limits; Speed harmonization; Work-zone traffic management; Weather-responsive traffic management",
  notes: "Published high-level estimate based on an assumed 7 percent crash reduction; the source notes that significance testing was not performed because of the short pilot duration.",
};

setOverride("Texas", 2015, "bc_new_safety_benefit", {
  ...texasVslSource,
  value: 8688909,
  sourceValueNote: "Combined annual benefits: $2,112,983 San Antonio + $2,358,976 Temple + $4,216,950 Ranger Hill.",
  derivationMethod: "Summed the three annual benefit values in the published pilot-site table.",
});

setOverride("Texas", 2015, "bc_new_cost_total", {
  ...texasVslSource,
  value: 838815,
  sourceValueNote: "Combined annual costs: $300,370 San Antonio + $238,075 Temple + $300,370 Ranger Hill.",
  derivationMethod: "Summed the three annualized capital and O&M cost values in the published pilot-site table.",
});

const austinTmcSource = {
  provenanceType: "Exact_Dataset",
  evidenceScope: "City of Austin TMC expansion, April-December 2016; project-level result",
  sourceTitle: "Performance Evaluation for City of Austin Transportation Management Center Expansion",
  sourceUrl: "https://www.itskrs.its.dot.gov/2021-b01521",
  sourcePublicationYear: 2017,
  technologies: "Transportation management center operations; Lane-blocking incident response; Traffic signal retiming; Probe-vehicle travel-time monitoring",
  notes: "The source evaluation period was April-December 2016 and included measured and modeled activity components.",
};

setOverride("Texas", 2016, "bc_new_mobility_benefit", {
  ...austinTmcSource,
  value: 4527131,
  sourceValueNote: "$4,527,131 total benefit reported for TMC expansion activities.",
  derivationMethod: "Used the total benefit printed in the evaluation table.",
});

setOverride("Texas", 2016, "bc_new_cost_total", {
  ...austinTmcSource,
  value: 1237329,
  sourceValueNote: "$1,237,329 TMC expansion cost reported in the evaluation table.",
  derivationMethod: "Used the total expansion cost printed in the evaluation table.",
});

function normalizeNumber(value) {
  const parsed = Number(String(value ?? "").replace(/[$,]/g, "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

const legacyText = await fs.readFile(legacyCsvPath, "utf8");
const legacyWorkbook = await Workbook.fromCSV(legacyText, { sheetName: "Legacy" });
const legacyValues = legacyWorkbook.worksheets.getItemAt(0).getUsedRange(true).values;
const legacyHeaders = legacyValues[0].map((value) => String(value ?? "").trim());
const legacyRows = legacyValues.slice(1).map((values) =>
  Object.fromEntries(legacyHeaders.map((header, index) => [header, values[index]])),
);

const outputHeaders = [
  "state",
  "survey_year",
  "dataset_version",
  "component_key",
  "component_label",
  "value",
  "provenance_type",
  "review_required",
  "evidence_scope",
  "source_title",
  "source_url",
  "source_publication_year",
  "source_value_note",
  "derivation_method",
  "technologies",
  "original_mock_value",
  "mock_default_method",
  "notes",
];

const outputRows = [];
for (const legacyRow of legacyRows) {
  const state = String(legacyRow.state ?? "").trim();
  const year = Number(legacyRow.survey_year);
  for (const component of components) {
    const originalMockValue = normalizeNumber(legacyRow[component.key]);
    const override = exactOverrides.get(`${state}|${year}|${component.key}`);
    const isMock = !override;
    outputRows.push({
      state,
      survey_year: year,
      dataset_version: DATASET_VERSION,
      component_key: component.key,
      component_label: component.label,
      value: override?.value ?? originalMockValue,
      provenance_type: override?.provenanceType ?? "Mock_Default",
      review_required: isMock,
      evidence_scope: override?.evidenceScope ?? "State-year model baseline; no matching authorized monetary record verified",
      source_title: override?.sourceTitle ?? "Legacy bc_baseline_mock_v1 supported by ITS JPO Benefits/Costs databases",
      source_url: override?.sourceUrl ?? (component.kind === "benefit" ? MOCK_BENEFIT_URL : MOCK_COST_URL),
      source_publication_year: override?.sourcePublicationYear ?? "",
      source_value_note: override?.sourceValueNote ?? `Mock_Default value carried forward: $${originalMockValue.toLocaleString("en-US")}.`,
      derivation_method: override?.derivationMethod ?? mockMethods[component.kind],
      technologies: override?.technologies ?? component.mockTechnologies,
      original_mock_value: originalMockValue,
      mock_default_method: mockMethods[component.kind],
      notes: override?.notes ?? String(legacyRow.source_notes ?? "").trim(),
    });
  }
}

await fs.mkdir(outputDir, { recursive: true });
const csvLines = [
  outputHeaders.join(","),
  ...outputRows.map((row) => outputHeaders.map((header) => csvCell(row[header])).join(",")),
];
const outputCsvText = `${csvLines.join("\n")}\n`;
await fs.writeFile(outputCsvPath, outputCsvText, "utf8");
await fs.writeFile(repositoryCsvPath, outputCsvText, "utf8");

const workbook = Workbook.create();
const dataSheet = workbook.worksheets.add("BC_Analysis_Default");
dataSheet.showGridLines = false;
dataSheet.freezePanes.freezeRows(1);
dataSheet.getRangeByIndexes(0, 0, outputRows.length + 1, outputHeaders.length).values = [
  outputHeaders,
  ...outputRows.map((row) => outputHeaders.map((header) => row[header])),
];

const dataRange = dataSheet.getRangeByIndexes(0, 0, outputRows.length + 1, outputHeaders.length);
dataRange.format = {
  font: { name: "Aptos", size: 10, color: "#25364A" },
  verticalAlignment: "top",
};
dataSheet.getRangeByIndexes(0, 0, 1, outputHeaders.length).format = {
  fill: "#17365D",
  font: { name: "Aptos Display", size: 10, bold: true, color: "#FFFFFF" },
  rowHeight: 32,
  wrapText: true,
  verticalAlignment: "center",
};
dataSheet.getRange(`F2:F${outputRows.length + 1}`).format.numberFormat = "$#,##0";
dataSheet.getRange(`P2:P${outputRows.length + 1}`).format.numberFormat = "$#,##0";
dataSheet.getRange(`A2:R${outputRows.length + 1}`).format.borders = {
  insideHorizontal: { style: "thin", color: "#D9E2F3" },
};
dataSheet.getRange(`G2:G${outputRows.length + 1}`).conditionalFormats.add("containsText", {
  text: "Mock_Default",
  format: { fill: "#FCE8E6", font: { color: "#B3261E", bold: true } },
});
dataSheet.getRange(`H2:H${outputRows.length + 1}`).conditionalFormats.add("containsText", {
  text: "TRUE",
  format: { fill: "#FCE8E6", font: { color: "#B3261E", bold: true } },
});
dataSheet.tables.add(`A1:R${outputRows.length + 1}`, true, "BCAnalysisDefaultTable").style = "TableStyleMedium2";

const columnWidths = [18, 11, 24, 34, 30, 16, 20, 16, 34, 38, 48, 16, 48, 58, 48, 18, 58, 44];
columnWidths.forEach((width, index) => {
  dataSheet.getRangeByIndexes(0, index, outputRows.length + 1, 1).format.columnWidth = width;
});
dataSheet.getRange(`I2:R${outputRows.length + 1}`).format.wrapText = true;

const qaSheet = workbook.worksheets.add("QA Summary");
qaSheet.showGridLines = false;
qaSheet.getRange("A1:F1").merge();
qaSheet.getRange("A1").values = [["BC Analysis Default — QA Summary"]];
qaSheet.getRange("A1:F1").format = {
  fill: "#17365D",
  font: { name: "Aptos Display", size: 16, bold: true, color: "#FFFFFF" },
  rowHeight: 34,
  verticalAlignment: "center",
};
qaSheet.getRange("A3:B8").values = [
  ["Check", "Result"],
  ["State-year rows expected", 48],
  ["Component rows expected", 384],
  ["Component rows generated", outputRows.length],
  ["Exact dataset values", outputRows.filter((row) => row.provenance_type === "Exact_Dataset").length],
  ["Authorized derived values", outputRows.filter((row) => row.provenance_type === "Authorized_Derived").length],
];
qaSheet.getRange("D3:E5").values = [
  ["Review status", "Count"],
  ["Mock_Default — review required", outputRows.filter((row) => row.review_required).length],
  ["Authorized source value", outputRows.filter((row) => !row.review_required).length],
];
qaSheet.getRange("A3:B3").format = { fill: "#D9EAF7", font: { bold: true, color: "#17365D" } };
qaSheet.getRange("D3:E3").format = { fill: "#D9EAF7", font: { bold: true, color: "#17365D" } };
qaSheet.getRange("A10:F15").values = [
  ["Provenance rule", "Meaning", "Used for score", "Review required", "Coverage caveat", "Display treatment"],
  ["Exact_Dataset", "Monetary value printed in an authorized source", "Yes", "No", "May be project or line-item scope", "Show source and scope"],
  ["Authorized_Derived", "Calculated from authorized physical measures and USDOT factors", "Yes", "No", "Not printed directly in source", "Show formula and source"],
  ["Mock_Default", "Legacy modeled value retained where no matched record was verified", "Yes", "Yes", "Not observed", "Highlight for expert review"],
  ["", "", "", "", "", ""],
  ["Primary key", "state + survey_year + component_key", "", "", "", ""],
];
qaSheet.getRange("A10:F10").format = { fill: "#D9EAF7", font: { bold: true, color: "#17365D" }, wrapText: true };
qaSheet.getRange("A1:F15").format.font = { name: "Aptos", size: 10, color: "#25364A" };
qaSheet.getRange("A1:F1").format.font = { name: "Aptos Display", size: 16, bold: true, color: "#FFFFFF" };
qaSheet.getRange("A3:F15").format.wrapText = true;
[26, 48, 16, 18, 36, 28].forEach((width, index) => {
  qaSheet.getRangeByIndexes(0, index, 15, 1).format.columnWidth = width;
});

const dictionarySheet = workbook.worksheets.add("Data Dictionary");
dictionarySheet.showGridLines = false;
dictionarySheet.freezePanes.freezeRows(1);
const dictionaryRows = [
  ["Column", "Definition"],
  ["state", "State represented by the component record."],
  ["survey_year", "B/C scorecard year, 2000 through 2023."],
  ["dataset_version", "BC_Analysis_Default_v1."],
  ["component_key", "One of the eight unchanged B/C calculation input keys."],
  ["component_label", "User-facing B/C component label."],
  ["value", "Numeric value used by the B/C scoring calculation."],
  ["provenance_type", "Exact_Dataset, Authorized_Derived, or Mock_Default."],
  ["review_required", "TRUE only when the scoring value is Mock_Default."],
  ["evidence_scope", "Geographic/program coverage represented by the source."],
  ["source_title", "Authorized source or legacy model reference."],
  ["source_url", "Public source URL; multiple URLs are separated by semicolons."],
  ["source_publication_year", "Publication/report year when available."],
  ["source_value_note", "Exact source value or concise explanation of the retained mock value."],
  ["derivation_method", "How the scoring value was taken or calculated."],
  ["technologies", "Semicolon-separated ITS technologies contributing to or assumed by the component."],
  ["original_mock_value", "Original bc_baseline_mock_v1 value for comparison."],
  ["mock_default_method", "Legacy mock-generation approach, retained for expert review."],
  ["notes", "Additional limitations or historical notes."],
];
dictionarySheet.getRangeByIndexes(0, 0, dictionaryRows.length, 2).values = dictionaryRows;
dictionarySheet.getRange("A1:B1").format = { fill: "#17365D", font: { name: "Aptos Display", bold: true, color: "#FFFFFF" }, rowHeight: 28 };
dictionarySheet.getRange(`A2:B${dictionaryRows.length}`).format = { font: { name: "Aptos", size: 10, color: "#25364A" }, wrapText: true, verticalAlignment: "top" };
dictionarySheet.getRange(`A1:A${dictionaryRows.length}`).format.columnWidth = 28;
dictionarySheet.getRange(`B1:B${dictionaryRows.length}`).format.columnWidth = 86;

const preview = await workbook.render({
  sheetName: "BC_Analysis_Default",
  range: "A1:R20",
  scale: 1,
  format: "png",
});
await fs.writeFile(previewPath, new Uint8Array(await preview.arrayBuffer()));

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(outputXlsxPath);

const inspect = await workbook.inspect({
  kind: "table",
  range: "QA Summary!A1:F15",
  include: "values,formulas",
  tableMaxRows: 20,
  tableMaxCols: 8,
  maxChars: 6000,
});

const errorScan = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
  maxChars: 3000,
});

console.log(JSON.stringify({
  csv: outputCsvPath,
  repositoryCsv: repositoryCsvPath,
  xlsx: outputXlsxPath,
  preview: previewPath,
  rows: outputRows.length,
  exact: outputRows.filter((row) => row.provenance_type === "Exact_Dataset").length,
  derived: outputRows.filter((row) => row.provenance_type === "Authorized_Derived").length,
  mock: outputRows.filter((row) => row.provenance_type === "Mock_Default").length,
  qa: inspect.ndjson,
  formulaErrors: errorScan.ndjson,
}, null, 2));
