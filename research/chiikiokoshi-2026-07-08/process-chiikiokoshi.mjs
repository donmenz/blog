import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const baseDir = path.dirname(fileURLToPath(import.meta.url));
const rawDir = path.join(baseDir, "raw");

const prefNames = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
];

const fields = [
  "title", "category", "label_category", "application_period", "work_overview",
  "target", "people_number", "work_location", "work_time", "employ_status",
  "salary", "treatment", "selection_flow", "reference_url", "support_system",
  "other", "neccessary_capacity", "keyword", "salary2", "work_day",
  "inquiry_person", "inquiry_mail", "inquiry_reference_url", "inquiry_phone"
];

function value(contents, key) {
  return contents?.[key]?.contents ?? "";
}

function stripHtml(input) {
  return String(input ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function countBy(items, key) {
  const result = {};
  for (const item of items) {
    const raw = typeof key === "function" ? key(item) : item[key];
    const values = Array.isArray(raw) ? raw : String(raw || "未記載").split(",");
    for (const value of values.map((v) => String(v).trim()).filter(Boolean)) {
      result[value] = (result[value] || 0) + 1;
    }
  }
  return Object.fromEntries(Object.entries(result).sort((a, b) => b[1] - a[1]));
}

function extractYenMonthly(text) {
  const normalized = String(text ?? "").replace(/[０-９，．]/g, (char) => {
    const table = {"，": ",", "．": "."};
    if (table[char]) return table[char];
    return String.fromCharCode(char.charCodeAt(0) - 0xfee0);
  });
  const candidates = [];
  for (const match of normalized.matchAll(/([0-9][0-9,]*(?:\.[0-9]+)?)\s*(万円|円)/g)) {
    const amount = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(amount)) continue;
    candidates.push(match[2] === "万円" ? Math.round(amount * 10000) : Math.round(amount));
  }
  return candidates.find((amount) => amount >= 50000 && amount <= 600000) ?? null;
}

const orgByGroupNo = JSON.parse(fs.readFileSync(path.join(rawDir, "organization_group_organization.json"), "utf8"));
const jobs = [];
for (const file of fs.readdirSync(rawDir).filter((name) => /^page-\d+\.json$/.test(name)).sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))) {
  const page = JSON.parse(fs.readFileSync(path.join(rawDir, file), "utf8"));
  for (const recruit of page.data?.[0]?.list ?? []) {
    const contents = recruit.recruit_application_contents ?? {};
    const org = orgByGroupNo[String(recruit.user_group_no)] ?? {};
    const organization = org.organizationName ?? "";
    const prefecture = prefNames.find((pref) => organization.startsWith(pref)) || prefNames.find((pref) => value(contents, "work_location").includes(pref)) || "";
    const job = {
      id: recruit.recruit_application_no,
      detail_url: `https://www.iju-join.jp/cgi-bin/recruit.php/9/detail/${recruit.recruit_application_no}`,
      published_at: recruit.application_datetime,
      user_group_no: recruit.user_group_no,
      organization,
      prefecture,
      monthly_salary_yen: extractYenMonthly(value(contents, "salary")),
    };
    for (const field of fields) job[field] = stripHtml(value(contents, field));
    job.text_summary = stripHtml(value(contents, "text")).slice(0, 1200);
    jobs.push(job);
  }
}

const monthly = jobs.map((job) => job.monthly_salary_yen).filter(Boolean).sort((a, b) => a - b);
const percentile = (arr, p) => arr.length ? arr[Math.floor((arr.length - 1) * p)] : null;
const summary = {
  collected_at: "2026-07-08",
  source: "https://www.iju-join.jp/cgi-bin/recruit.php/9/list",
  api: "https://www.iju-join.jp/cgi-bin/join_recruit.php",
  total_jobs: jobs.length,
  salary_detected_count: monthly.length,
  monthly_salary_yen: {
    min: monthly[0] ?? null,
    p25: percentile(monthly, 0.25),
    median: percentile(monthly, 0.5),
    p75: percentile(monthly, 0.75),
    max: monthly.at(-1) ?? null,
  },
  by_prefecture: countBy(jobs, "prefecture"),
  by_category: countBy(jobs, "category"),
  by_salary_band: countBy(jobs, "salary2"),
  by_work_day: countBy(jobs, "work_day"),
  by_license_required: countBy(jobs, "neccessary_capacity"),
  by_support_system: countBy(jobs, "support_system"),
  by_other_tags: countBy(jobs, "other"),
};

fs.writeFileSync(path.join(baseDir, "jobs.json"), JSON.stringify(jobs, null, 2));
fs.writeFileSync(path.join(baseDir, "summary.json"), JSON.stringify(summary, null, 2));

const csvHeader = [
  "id", "title", "organization", "prefecture", "category", "label_category",
  "salary2", "monthly_salary_yen", "work_day", "neccessary_capacity",
  "support_system", "other", "work_location", "people_number",
  "application_period", "detail_url"
];
const csvRows = [csvHeader.join(",")].concat(jobs.map((job) => csvHeader.map((key) => csvEscape(job[key])).join(",")));
fs.writeFileSync(path.join(baseDir, "jobs.csv"), csvRows.join("\n"));

const priorityJobs = jobs
  .filter((job) => job.label_category.includes("協力隊"))
  .sort((a, b) => {
    const score = (job) =>
      (job.salary2.includes("20万円以上") ? 4 : 0) +
      (job.other.includes("未経験者歓迎") ? 3 : 0) +
      (job.other.includes("副業") ? 2 : 0) +
      (job.support_system.includes("住居") ? 2 : 0) +
      (job.support_system.includes("研修") ? 1 : 0) +
      (job.support_system.includes("定住") ? 1 : 0);
    return score(b) - score(a);
  })
  .slice(0, 30);

const md = [
  "# 地域おこし協力隊 募集情報候选清单",
  "",
  `- 采集日期: ${summary.collected_at}`,
  `- 数据源: ${summary.source}`,
  `- 当前有效募集记录: ${summary.total_jobs} 件`,
  "",
  "| ID | 标题 | 自治体 | 类别 | 报酬 | 支援/标签 | 链接 |",
  "|---|---|---|---|---|---|---|",
  ...priorityJobs.map((job) => [
    job.id,
    job.title,
    job.organization || job.prefecture,
    job.category,
    job.salary.replace(/\n/g, " / ").slice(0, 60),
    [job.support_system, job.other].filter(Boolean).join(" / ").slice(0, 80),
    job.detail_url,
  ].map((cell) => String(cell).replace(/\|/g, "/")).join("|")).map((row) => `|${row}|`)
];
fs.writeFileSync(path.join(baseDir, "candidate-shortlist.md"), md.join("\n"));

console.log(JSON.stringify({
  jobs: jobs.length,
  output: ["jobs.json", "jobs.csv", "summary.json", "candidate-shortlist.md"],
  salary: summary.monthly_salary_yen,
}, null, 2));
