# 获取token
$loginResponse = Invoke-RestMethod -Uri "http://localhost:3000/api/login" -Method POST -Body (@{username='admin'; password='admin123'} | ConvertTo-Json) -ContentType "application/json"
$token = $loginResponse.token
Write-Host "获取到token: $token"

# 准备文件上传
$filePath = "test-docx.docx"
$uri = "http://localhost:3000/api/print"

# 创建HTTP客户端
$client = New-Object System.Net.Http.HttpClient
$client.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", $token)

# 创建多部分表单数据
$content = New-Object System.Net.Http.MultipartFormDataContent
$fileStream = New-Object System.IO.FileStream($filePath, [System.IO.FileMode]::Open)
$fileContent = New-Object System.Net.Http.StreamContent($fileStream)
$content.Add($fileContent, "file", "test-docx.docx")

# 添加其他必要参数
$content.Add((New-Object System.Net.Http.StringContent("1")), "copies")
$content.Add((New-Object System.Net.Http.StringContent("7100cn")), "printer")

# 发送请求
Write-Host "正在上传文件并测试转换功能..."
try {
    $response = $client.PostAsync($uri, $content).Result
    $responseText = $response.Content.ReadAsStringAsync().Result
    Write-Host "响应状态码: $($response.StatusCode)"
    Write-Host "响应结果:"
    Write-Host $responseText
} catch {
    Write-Host "错误: $($_.Exception.Message)"
} finally {
    $fileStream.Dispose()
    $fileContent.Dispose()
    $content.Dispose()
    $client.Dispose()
}

# 检查上传目录
Write-Host "`n检查上传目录中的文件:"
docker exec remote-printer ls -la /app/uploads