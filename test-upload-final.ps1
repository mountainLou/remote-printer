# 测试文件上传和docx转PDF功能

# 1. 登录获取token
Write-Host "正在登录..."
try {
    $loginBody = @{username='admin'; password='admin123'} | ConvertTo-Json
    $loginResponse = Invoke-WebRequest -Uri "http://localhost:3000/api/login" -Method POST -Body $loginBody -ContentType "application/json" -UseBasicParsing
    $loginData = $loginResponse.Content | ConvertFrom-Json
    $token = $loginData.token
    Write-Host "登录成功，获取到token: $token"
} catch {
    Write-Host "登录失败: $($_.Exception.Message)"
    exit 1
}

# 2. 准备文件上传
Write-Host "`n准备上传文件..."
$filePath = "test-docx.docx"
if (-not (Test-Path $filePath)) {
    Write-Host "测试文件不存在: $filePath"
    exit 1
}

# 3. 构建多部分表单数据
Write-Host "`n构建上传请求..."
$boundary = [System.Guid]::NewGuid().ToString()
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "multipart/form-data; boundary=$boundary"
}

# 读取文件内容
$fileBytes = [System.IO.File]::ReadAllBytes($filePath)
$fileContent = [System.Convert]::ToBase64String($fileBytes)

# 构建请求体
$bodyParts = @()
$bodyParts += "--$boundary"
$bodyParts += 'Content-Disposition: form-data; name="file"; filename="test-docx.docx"'
$bodyParts += 'Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document'
$bodyParts += 'Content-Transfer-Encoding: base64'
$bodyParts += ''
$bodyParts += $fileContent
$bodyParts += "--$boundary"
$bodyParts += 'Content-Disposition: form-data; name="copies"'
$bodyParts += ''
$bodyParts += '1'
$bodyParts += "--$boundary"
$bodyParts += 'Content-Disposition: form-data; name="printer"'
$bodyParts += ''
$bodyParts += '7100cn'
$bodyParts += "--$boundary--"
$body = $bodyParts -join "`r`n"

# 4. 发送文件上传请求
Write-Host "正在上传文件并测试转换功能..."
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/api/print" -Method POST -Headers $headers -Body $body -UseBasicParsing
    $responseData = $response.Content | ConvertFrom-Json
    Write-Host "响应状态码: $($response.StatusCode)"
    Write-Host "响应结果:"
    Write-Host $response.Content
} catch {
    Write-Host "上传失败: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $errorBody = $reader.ReadToEnd()
        $reader.Close()
        Write-Host "错误详情: $errorBody"
    }
}

# 5. 检查上传目录中的文件
Write-Host "`n检查上传目录中的文件:"
docker exec remote-printer ls -la /app/uploads
