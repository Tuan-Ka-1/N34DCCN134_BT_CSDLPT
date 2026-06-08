Add-Type -AssemblyName System.IO.Compression.FileSystem
$zipPath = "d:\personal\CSDL PT\CuoiKy_CSDLPT\document\BaoCao_CSDLPT.docx"
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$entry = $zip.GetEntry("word/document.xml")
$stream = $entry.Open()
$reader = New-Object System.IO.StreamReader($stream)
$content = $reader.ReadToEnd()
$reader.Close()
$zip.Dispose()
[xml]$doc = $content
$ns = new-object Xml.XmlNamespaceManager $doc.NameTable
$ns.AddNamespace("w", "http://schemas.openxmlformats.org/wordprocessingml/2006/main")
$nodes = $doc.SelectNodes("//w:p", $ns)
$text = foreach ($node in $nodes) { $node.InnerText }
$text -join "`n"
