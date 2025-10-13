# 聆竹 API 配置指南

## AssemblyAI 设置

聆竹使用 AssemblyAI 的说话人识别（Speaker Diarization）功能来识别音频中的不同说话人。

### 1. 获取 API Key

1. 访问 [AssemblyAI](https://www.assemblyai.com/)
2. 注册一个免费账号
3. 进入 [Dashboard](https://www.assemblyai.com/app)
4. 复制你的 API Key

### 2. 配置 API Key

在项目根目录创建 `.env.local` 文件（如果还不存在）：

```bash
# .env.local
ASSEMBLYAI_API_KEY=your_api_key_here
```

将 `your_api_key_here` 替换为你的实际 API Key。

### 3. 重启开发服务器

```bash
npm run dev
```

## 使用说明

1. 点击「听」字按钮
2. 选择一个音频文件（支持 MP3、WAV、M4A 等格式）
3. 等待说话人识别完成（通常需要几秒到几分钟，取决于音频长度）
4. 查看结果：
   - 说话人将被命名为「说话人1」、「说话人2」等
   - 每个句子显示为独立的竹简
   - 可以点击时间戳跳转到对应位置

## API 限制

### 免费版限制：
- 每月 300 分钟转录时长
- 适合测试和小规模使用

### 付费版：
- 更高的配额
- 更快的处理速度
- 访问 [定价页面](https://www.assemblyai.com/pricing) 了解更多

## 支持的语言

AssemblyAI 支持多种语言，包括：
- 中文（zh）
- 英文（en）
- 西班牙语（es）
- 法语（fr）
- 德语（de）
- 等等...

当前配置为中文（`language_code: 'zh'`）。

## 故障排查

### 错误：AssemblyAI API密钥未配置
- 确保 `.env.local` 文件存在
- 确保文件中包含 `ASSEMBLYAI_API_KEY=...`
- 重启开发服务器

### 错误：音频文件加载失败
- 检查音频格式是否支持
- 确保文件大小不超过 API 限制
- 查看浏览器控制台获取详细错误信息

### 处理时间过长
- AssemblyAI 处理时间取决于音频长度
- 一般来说，处理时间约为音频时长的 10-30%
- 较长的音频文件需要更多时间

## 技术细节

### API 端点
- `POST /api/diarization` - 上传音频并进行说话人识别

### 响应格式
```typescript
{
  success: true,
  data: {
    sentences: [
      {
        id: string,
        speaker: string,  // "说话人1", "说话人2", etc.
        text: string,
        startTime: number,
        endTime: number,
        confidence: number
      }
    ],
    speakers: [
      {
        id: string,
        name: string,
        utteranceCount: number,
        totalDuration: number,
        color: string
      }
    ],
    duration: number,
    totalSpeakers: number
  }
}
```

## 下一步

- [ ] 添加音频播放功能
- [ ] 支持本地模型（ONNX）
- [ ] 导出转录结果
- [ ] 自定义说话人名称
- [ ] 批量处理多个文件
