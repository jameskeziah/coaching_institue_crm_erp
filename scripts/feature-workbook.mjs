
import { strToU8, zipSync } from 'fflate';

const sheetNamespace = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const relationshipNamespace = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const packageNamespace = 'http://schemas.openxmlformats.org/package/2006/relationships';

function xml(value) {
  return String(value ?? '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').replace(/[<>&"']/g, char => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;',
  })[char]);
}

function column(index) {
  let letter = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letter = String.fromCharCode(65 + (n - 1) % 26) + letter;
  }
  return letter;
}

export function featureWorkbook(rows) {
  const lastCell = column(rows[0].length - 1) + rows.length;
  const columns = rows[0].map((label, index) => {
    const width = index === 0 ? 15 : /Description|Criteria|Evidence|Remaining|Limitations|Requirement/.test(label) ? 52
      : label === 'Feature' ? 42 : Math.max(18, label.length + 3);
    return '<col min="' + (index + 1) + '" max="' + (index + 1) + '" width="' + width + '" customWidth="1"/>';
  }).join('');
  const sheetRows = rows.map((row, index) => {
    const number = index + 1;
    const cells = row.map((value, i) => '<c r="' + column(i) + number + '" t="inlineStr" s="' + (index ? '0' : '1')
      + '"><is><t xml:space="preserve">' + xml(value) + '</t></is></c>').join('');
    return '<row r="' + number + '">' + cells + '</row>';
  }).join('');
  const types = 'application/vnd.openxmlformats-officedocument.spreadsheetml.';
  const files = {
    '[Content_Types].xml': '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
      + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
      + '<Default Extension="xml" ContentType="application/xml"/>'
      + '<Override PartName="/xl/workbook.xml" ContentType="' + types + 'sheet.main+xml"/>'
      + '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="' + types + 'worksheet+xml"/>'
      + '<Override PartName="/xl/styles.xml" ContentType="' + types + 'styles+xml"/></Types>',
    '_rels/.rels': '<Relationships xmlns="' + packageNamespace + '">'
      + '<Relationship Id="rId1" Type="' + relationshipNamespace + '/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<workbook xmlns="' + sheetNamespace + '" xmlns:r="' + relationshipNamespace
      + '"><bookViews><workbookView/></bookViews><sheets><sheet name="Feature matrix" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships xmlns="' + packageNamespace + '">'
      + '<Relationship Id="rId1" Type="' + relationshipNamespace + '/worksheet" Target="worksheets/sheet1.xml"/>'
      + '<Relationship Id="rId2" Type="' + relationshipNamespace + '/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': '<styleSheet xmlns="' + sheetNamespace + '"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>'
      + '<font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts>'
      + '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>'
      + '<fill><patternFill patternType="solid"><fgColor rgb="FF17365D"/><bgColor indexed="64"/></patternFill></fill></fills>'
      + '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
      + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
      + '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
      + '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>'
      + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    'xl/worksheets/sheet1.xml': '<worksheet xmlns="' + sheetNamespace + '"><dimension ref="A1:' + lastCell + '"/>'
      + '<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane xSplit="1" ySplit="1" topLeftCell="B2" activePane="bottomRight" state="frozen"/>'
      + '<selection pane="bottomRight" activeCell="B2" sqref="B2"/></sheetView></sheetViews><cols>'
      + columns + '</cols><sheetData>' + sheetRows + '</sheetData><autoFilter ref="A1:' + lastCell + '"/></worksheet>',
  };
  const zipEntries = Object.fromEntries(Object.entries(files).map(([file, contents]) => [
    file, strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + contents),
  ]));
  return Buffer.from(zipSync(zipEntries, { level: 6, mtime: new Date(2000, 0, 1) }));
}
