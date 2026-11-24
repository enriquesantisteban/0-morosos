type CellValue = string | number

const xmlEscape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!)
const concatBytes = (parts: Uint8Array[]) => {
  const output = new Uint8Array(parts.reduce((length, part) => length + part.length, 0))
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

function zipStored(files: { name: string; content: string }[]) {
  const encoder = new TextEncoder()
  const localFiles: Uint8Array[] = []
  const centralFiles: Uint8Array[] = []
  let localOffset = 0
  const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
    let value = index
    for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    return value >>> 0
  })
  const crc32 = (bytes: Uint8Array) => {
    let crc = 0xffffffff
    for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
    return (crc ^ 0xffffffff) >>> 0
  }

  for (const file of files) {
    const name = encoder.encode(file.name)
    const data = encoder.encode(file.content)
    const checksum = crc32(data)
    const local = new Uint8Array(30 + name.length + data.length)
    const localView = new DataView(local.buffer)
    localView.setUint32(0, 0x04034b50, true)
    localView.setUint16(4, 20, true)
    localView.setUint16(6, 0, true)
    localView.setUint16(8, 0, true)
    localView.setUint16(10, 0, true)
    localView.setUint16(12, 0x21, true)
    localView.setUint32(14, checksum, true)
    localView.setUint32(18, data.length, true)
    localView.setUint32(22, data.length, true)
    localView.setUint16(26, name.length, true)
    localView.setUint16(28, 0, true)
    local.set(name, 30)
    local.set(data, 30 + name.length)
    localFiles.push(local)

    const central = new Uint8Array(46 + name.length)
    const centralView = new DataView(central.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint16(8, 0, true)
    centralView.setUint16(10, 0, true)
    centralView.setUint16(12, 0, true)
    centralView.setUint16(14, 0x21, true)
    centralView.setUint32(16, checksum, true)
    centralView.setUint32(20, data.length, true)
    centralView.setUint32(24, data.length, true)
    centralView.setUint16(28, name.length, true)
    centralView.setUint16(30, 0, true)
    centralView.setUint16(32, 0, true)
    centralView.setUint16(34, 0, true)
    centralView.setUint16(36, 0, true)
    centralView.setUint32(38, 0, true)
    centralView.setUint32(42, localOffset, true)
    central.set(name, 46)
    centralFiles.push(central)
    localOffset += local.length
  }

  const centralDirectory = concatBytes(centralFiles)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(4, 0, true)
  endView.setUint16(6, 0, true)
  endView.setUint16(8, files.length, true)
  endView.setUint16(10, files.length, true)
  endView.setUint32(12, centralDirectory.length, true)
  endView.setUint32(16, localOffset, true)
  endView.setUint16(20, 0, true)
  return concatBytes([...localFiles, centralDirectory, end])
}

export function createStyledXlsx(headers: string[], rows: CellValue[][], total: number) {
  const columnName = (index: number) => String.fromCharCode(65 + index)
  const inlineCell = (reference: string, value: string, style: number) => `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`
  const numberCell = (reference: string, value: number, style: number) => `<c r="${reference}" s="${style}"><v>${Number.isFinite(value) ? value : 0}</v></c>`
  const dataRows = rows.map((row, rowIndex) => `<row r="${rowIndex + 2}">${row.map((value, columnIndex) => {
    const reference = `${columnName(columnIndex)}${rowIndex + 2}`
    return typeof value === 'number' ? numberCell(reference, value, columnIndex === headers.length - 1 ? rowIndex % 2 ? 5 : 4 : rowIndex % 2 ? 3 : 2) : inlineCell(reference, value, rowIndex % 2 ? 3 : 2)
  }).join('')}</row>`).join('')
  const totalRow = rows.length + 2
  const lastDataRow = Math.max(1, rows.length + 1)
  const headerRow = `<row r="1">${headers.map((header, index) => inlineCell(`${columnName(index)}1`, header, 1)).join('')}</row>`
  const totalCells = `<row r="${totalRow}"><c r="A${totalRow}" s="6" t="inlineStr"><is><t>TOTAL DEL PERIODO</t></is></c>${headers.slice(1, -1).map((_, index) => `<c r="${columnName(index + 1)}${totalRow}" s="6"/>`).join('')}${numberCell(`${columnName(headers.length - 1)}${totalRow}`, total, 7)}</row>`
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="34" customWidth="1"/><col min="2" max="2" width="17" customWidth="1"/><col min="3" max="3" width="19" customWidth="1"/><col min="4" max="4" width="28" customWidth="1"/><col min="5" max="5" width="17" customWidth="1"/></cols><sheetData>${headerRow}${dataRows}${totalCells}</sheetData><autoFilter ref="A1:${columnName(headers.length - 1)}${lastDataRow}"/><mergeCells count="1"><mergeCell ref="A${totalRow}:${columnName(headers.length - 2)}${totalRow}"/></mergeCells></worksheet>`
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00 &quot;€&quot;"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Aptos"/><color rgb="FF344238"/></font><font><b/><sz val="10"/><name val="Aptos"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="11"/><name val="Aptos"/><color rgb="FF344238"/></font></fonts><fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF344D3A"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F5EF"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE5EDE2"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFE2E8E0"/></left><right style="thin"><color rgb="FFE2E8E0"/></right><top style="thin"><color rgb="FFE2E8E0"/></top><bottom style="thin"><color rgb="FFE2E8E0"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="8"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0"/><xf numFmtId="164" fontId="2" fillId="4" borderId="1" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Gastos del mes" sheetId="1" r:id="rId1"/></sheets></workbook>`
  return zipStored([
    { name: '[Content_Types].xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: '_rels/.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', content: workbook },
    { name: 'xl/_rels/workbook.xml.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/worksheets/sheet1.xml', content: worksheet },
    { name: 'xl/styles.xml', content: styles },
  ])
}
