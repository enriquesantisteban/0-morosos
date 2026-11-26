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

export function createStyledXlsx(headers: string[], rows: CellValue[][], total: number, totalColumnIndex = headers.length - 1, title = '') {
  const columnName = (index: number) => {
    let value = index + 1
    let name = ''
    while (value > 0) {
      const remainder = (value - 1) % 26
      name = String.fromCharCode(65 + remainder) + name
      value = Math.floor((value - 1) / 26)
    }
    return name
  }
  const inlineCell = (reference: string, value: string, style: number) => `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`
  const numberCell = (reference: string, value: number, style: number) => `<c r="${reference}" s="${style}"><v>${Number.isFinite(value) ? value : 0}</v></c>`
  const headerIndex = title ? 2 : 1
  const dataStartIndex = headerIndex + 1
  const dataRows = rows.map((row, rowIndex) => `<row r="${rowIndex + dataStartIndex}">${row.map((value, columnIndex) => {
    const reference = `${columnName(columnIndex)}${rowIndex + dataStartIndex}`
    return typeof value === 'number' ? numberCell(reference, value, rowIndex % 2 ? 5 : 4) : inlineCell(reference, value, rowIndex % 2 ? 3 : 2)
  }).join('')}</row>`).join('')
  const totalRow = rows.length + dataStartIndex
  const lastDataRow = Math.max(headerIndex, rows.length + headerIndex)
  const headerRow = `<row r="${headerIndex}">${headers.map((header, index) => inlineCell(`${columnName(index)}${headerIndex}`, header, 1)).join('')}</row>`
  const totalCells = `<row r="${totalRow}">${headers.map((_, index) => index === 0 ? `<c r="A${totalRow}" s="6" t="inlineStr"><is><t>TOTAL DEL PERIODO</t></is></c>` : index === totalColumnIndex ? numberCell(`${columnName(index)}${totalRow}`, total, 7) : `<c r="${columnName(index)}${totalRow}" s="6"/>`).join('')}</row>`
  const columns = headers.map((header, index) => `<col min="${index + 1}" max="${index + 1}" width="${index === 0 ? 17 : Math.max(13, Math.min(30, header.length + 3))}" customWidth="1"/>`).join('')
  const titleRow = title ? `<row r="1">${inlineCell('A1', title, 8)}</row>` : ''
  const titleMerge = title ? `<mergeCell ref="A1:${columnName(headers.length - 1)}1"/>` : ''
  const freezeRows = title ? 2 : 1
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="${freezeRows}" topLeftCell="A${freezeRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${columns}</cols><sheetData>${titleRow}${headerRow}${dataRows}${totalCells}</sheetData><autoFilter ref="A${headerIndex}:${columnName(headers.length - 1)}${lastDataRow}"/><mergeCells count="${title ? 2 : 1}">${titleMerge}<mergeCell ref="A${totalRow}:${columnName(Math.max(1, totalColumnIndex - 1))}${totalRow}"/></mergeCells></worksheet>`
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00 &quot;€&quot;"/></numFmts><fonts count="4"><font><sz val="11"/><name val="Aptos"/><color rgb="FF344238"/></font><font><b/><sz val="10"/><name val="Aptos"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="11"/><name val="Aptos"/><color rgb="FF344238"/></font><font><b/><sz val="16"/><name val="Aptos"/><color rgb="FF254468"/></font></fonts><fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF344D3A"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF1F5EF"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE5EDE2"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7E7E7"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFE2E8E0"/></left><right style="thin"><color rgb="FFE2E8E0"/></right><top style="thin"><color rgb="FFE2E8E0"/></top><bottom style="thin"><color rgb="FFE2E8E0"/></bottom><diagonal/></border><border><top style="medium"><color rgb="FFC85C20"/></top><bottom style="medium"><color rgb="FFC85C20"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="9"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0"/><xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="4" borderId="1" xfId="0"/><xf numFmtId="164" fontId="2" fillId="4" borderId="1" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="3" fillId="5" borderId="2" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Histórico" sheetId="1" r:id="rId1"/></sheets></workbook>`
  return zipStored([
    { name: '[Content_Types].xml', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: '_rels/.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', content: workbook },
    { name: 'xl/_rels/workbook.xml.rels', content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/worksheets/sheet1.xml', content: worksheet },
    { name: 'xl/styles.xml', content: styles },
  ])
}
