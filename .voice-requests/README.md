# Voice Requests

这个目录用于语音请求的同步通信。

格式：
- `{id}.request.json` - 请求文件
- `{id}.response.json` - 响应文件

webhook 写入请求，轮询响应。
OpenClaw 读取请求，处理后写入响应。
