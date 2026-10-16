import ExcelJS from "exceljs";
const [,, file, sheetIdx, maxRows] = process.argv;
const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(file);
const ws = wb.worksheets[Number(sheetIdx)];
console.log("##", ws.name);
let shown = 0;
ws.eachRow({ includeEmpty: false }, (row, n) => {
  const vals = row.values.slice(1).map(v => { if (v && typeof v === "object") { if (v.result !== undefined) return v.result; if (v.richText) return v.richText.map(r=>r.text).join(""); if (v.text) return v.text; if (v instanceof Date) return v.toISOString().slice(0,10);} return v; });
  while (vals.length && (vals[vals.length-1] === null || vals[vals.length-1] === undefined || vals[vals.length-1] === "")) vals.pop();
  if (!vals.some(v => v !== null && v !== undefined && v !== "")) return;
  if (shown++ < Number(maxRows)) console.log(n, JSON.stringify(vals.map(v => typeof v === "number" ? Math.round(v*100)/100 : v)));
});
console.log("(lignes non vides:", shown, ")");
