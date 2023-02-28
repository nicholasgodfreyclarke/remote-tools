tempDir = WScript.Arguments.Item(0)
wbName = WScript.Arguments.Item(1)
csvPath = WScript.Arguments.Item(2)
sheetNum = WScript.Arguments.Item(3)
datasetName = WScript.Arguments.Item(4)
timestamp = WScript.Arguments.Item(5)

'wscript.echo wbName
'wscript.echo csvPath
'wscript.echo sheetNum

On Error resume next
'Get currently open excel instance
Set obj = GetObject(, "Excel.Application")
If obj is Nothing then
  set obj = CreateObject("Excel.Application")
  obj.visible = True
  set wb = obj.Workbooks.Add
  wb.saveas(tempDir & "\" & wbname)
end if
On Error goto 0

wbFound = False
for each wb in obj.workbooks
  if wb.name = wbname then
    'wscript.echo "wb found " & wb.name
    wbFound = True
    exit for
  end if
next

if not wbFound then
  'Check that it hasn't been closed by user
  Set fso = CreateObject("Scripting.FileSystemObject")
  If (fso.FileExists(tempDir & "\" & wbname)) then
    set wb = obj.workbooks.open(tempDir & "\" & wbname)
  else
    set wb = obj.Workbooks.Add
    wb.saveas(tempDir & "\" & wbname)
  end if
end if

if sheetNum = "1" then
  set ws = wb.Sheets(1)
else
  set ws = wb.sheets.add
end if
ws.Name = "Result " & sheetNum

Set qt = ws.QueryTables.Add("TEXT;" & csvPath, ws.Range("D1"))

qt.TextFileParseType = 1
qt.TextFileCommaDelimiter = True
qt.Refresh

ws.QueryTables(1).SaveData = False
ws.QueryTables.Item(1).Delete

ws.range("A1").value = "Dataset:"
ws.range("A2").value = "Data as of:"
ws.range("B1").value = datasetName
ws.range("B2").value = timestamp

ws.Columns("A:B").AutoFit

Set objShell = CreateObject("WScript.Shell")
objShell.AppActivate obj.Caption
wb.activate
ws.activate
