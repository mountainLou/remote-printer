# 获取token
$loginResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/login" -Method POST -Body (@{username='admin'; password='admin123'} | ConvertTo-Json) -ContentType "application/json"
$token = $loginResponse.token
Write-Host "获取到token: $token"

# 准备文件上传
$filePath = "test-docx.docx"
$fileName = Split-Path $filePath -Leaf
$uri = "http://localhost:3000/api/print"

# 创建HTTP请求
$request = [System.Net.HttpWebRequest]::Create($uri)
$request.Method = "POST"
$request.Headers.Add("Authorization", "Bearer $token")

# 设置边界
$boundary = [System.Guid]::NewGuid().ToString()
$request.ContentType = "multipart/form-data; boundary=$boundary"

# 读取文件内容
$fileStream = [System.IO.File]::OpenRead($filePath)
$fileBytes = New-Object byte[] $fileStream.Length
$fileStream.Read($fileBytes, 0, $fileStream.Length)
$fileStream.Close()

# 构建请求体
$bodyBuilder = New-Object System.Text.StringBuilder
$bodyBuilder.AppendLine("--$boundary")
$bodyBuilder.AppendLine('Content-Disposition: form-data; name="file"; filename="' + $fileName + '"')
$bodyBuilder.AppendLine('Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document')
$bodyBuilder.AppendLine()

# 添加文件内容
$bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($bodyBuilder.ToString())
$footerBytes = [System.Text.Encoding]::UTF8.GetBytes("`r`n--$boundary--`r`n")

# 设置请求长度
$request.ContentLength = $bodyBytes.Length + $fileBytes.Length + $footerBytes.Length

# 写入请求体
$requestStream = $request.GetRequestStream()
$requestStream.Write($bodyBytes, 0, $bodyBytes.Length)
$requestStream.Write($fileBytes, 0, $fileBytes.Length)
$requestStream.Write($footerBytes, 0, $footerBytes.Length)
$requestStream.Close()

# 发送请求并获取响应
Write-Host "正在上传文件并测试转换功能..."
try {
    $response = $request.GetResponse()
    $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
    $responseText = $reader.ReadToEnd()
    $reader.Close()
    $response.Close()
    
    Write-Host "响应结果:"
    Write-Host $responseText
    
    # 检查上传目录
    Write-Host "`n检查上传目录中的文件:"
    docker exec remote-printer ls -la /app/uploads
} catch {
    Write-Host "错误: $($_.Exception.Message)"
}