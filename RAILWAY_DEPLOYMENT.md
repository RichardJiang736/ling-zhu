# Railway.app Deployment Guide

## 🚂 Your app is now configured for Railway.app!

Railway.app is perfect for your audio processing application because it supports:
- ✅ **100MB+ file uploads** (no artificial limits)
- ✅ **Full Node.js runtime** with native modules (sherpa-onnx)
- ✅ **Python support** for your SepFormer scripts
- ✅ **FFmpeg** for audio processing
- ✅ **8GB RAM** available (plenty for your ML models)
- ✅ **Long execution times** for audio processing
- ✅ **$5/month** with generous usage limits

---

## 🚀 Deployment Steps

### 1. Install Railway CLI (Optional but recommended)
```bash
npm install -g @railway/cli
```

### 2. Login to Railway
```bash
railway login
```

### 3. Deploy via Railway Dashboard (Recommended for first time)

#### Option A: Deploy from GitHub (Recommended)
1. Go to https://railway.app/dashboard
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Connect your GitHub account and select this repository
5. Railway will auto-detect the configuration from `railway.json` and `nixpacks.toml`
6. Click **"Deploy"**

#### Option B: Deploy from CLI
```bash
# Initialize Railway project
railway init

# Link to your Railway project
railway link

# Deploy
railway up
```

### 4. Environment Variables (Optional)
If you need to set environment variables:
1. Go to your Railway project dashboard
2. Click on your service
3. Go to **"Variables"** tab
4. Add any required variables:
   - `NODE_ENV=production`
   - Database URLs (if using)
   - API keys (if any)

### 5. Custom Domain (Optional)
1. Go to **"Settings"** tab in your service
2. Scroll to **"Domains"**
3. Click **"Generate Domain"** for a free Railway subdomain
4. Or add your custom domain

---

## 📋 What Was Configured

### Files Created:
1. **`railway.json`** - Railway service configuration
   - Build and deployment commands
   - Health check endpoint
   - Restart policy

2. **`nixpacks.toml`** - System dependencies configuration
   - Node.js 20
   - Python 3.11
   - FFmpeg
   - Required Python packages (speechbrain, torch, torchaudio)

### Files Updated:
1. **API Routes** (`/api/diarization` and `/api/separate`)
   - Updated file size limit to 100MB
   - Increased `maxDuration` to 300 seconds
   - Added Railway-specific comments

---

## 🔍 Monitoring & Logs

### View Logs
```bash
railway logs
```

Or view in the Railway dashboard under the **"Deployments"** tab.

### Check Deployment Status
```bash
railway status
```

---

## 💰 Cost Estimation

Railway pricing is usage-based:
- **Starter Plan**: $5/month includes:
  - $5 of usage credit
  - Additional usage: ~$0.000463/GB-hour for memory
  - ~$0.000231/vCPU-hour for compute

For your audio processing app (estimated):
- Moderate usage: ~$5-15/month
- Heavy usage: ~$15-30/month
- Memory: Your app will use ~500MB-2GB depending on model size

---

## 🛠️ Troubleshooting

### Build Fails
- Check that all dependencies are in `package.json`
- Verify Python packages are available
- Check Railway logs: `railway logs`

### Models Not Loading
- Ensure model files are committed to your repo or accessible
- Check paths in `sherpa-diarization.ts` and `sepformer-separation.ts`
- Model files should be in these paths:
  - `./sherpa-onnx/sherpa-onnx-pyannote-segmentation-3-0/model.onnx`
  - `./sherpa-onnx/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx`

### Request Timeout
- Increase `maxDuration` in API routes (already set to 300s)
- Check Railway service logs for specific errors
- Consider optimizing audio processing for large files

### FFmpeg Not Found
- The `nixpacks.toml` includes ffmpeg
- Railway will automatically install it during build
- If issues persist, check build logs

---

## 📊 Performance Optimization Tips

1. **Model Loading**: Models are loaded once per container lifetime (already implemented)
2. **Temporary Files**: Use `/tmp` directory for temporary audio files (already configured)
3. **Memory**: Railway provides 8GB max RAM - upgrade plan if needed
4. **Caching**: Consider implementing Redis for repeated requests (optional)

---

## 🔐 Security Notes

1. **Environment Variables**: Store sensitive data in Railway environment variables, not in code
2. **HTTPS**: Railway provides free HTTPS automatically
3. **File Upload**: Current limit is 100MB - adjust in API routes if needed

---

## 📚 Useful Commands

```bash
# View service info
railway status

# View logs in real-time
railway logs --follow

# Open service in browser
railway open

# Run commands in Railway environment
railway run npm run db:migrate

# SSH into Railway container
railway shell
```

---

## 🎯 Next Steps

1. **Commit changes** to your Git repository:
   ```bash
   git add railway.json nixpacks.toml src/app/api/
   git commit -m "Configure Railway.app deployment"
   git push
   ```

2. **Deploy** via Railway dashboard (Option A above)

3. **Test your deployment**:
   - Visit your Railway URL
   - Upload a test audio file
   - Verify speaker diarization works
   - Test the "导出分段" (export segments) feature

4. **Monitor** your first deployment in Railway dashboard

---

## 🆘 Need Help?

- **Railway Documentation**: https://docs.railway.app
- **Railway Discord**: https://discord.gg/railway
- **Railway Status**: https://status.railway.app

---

**Ready to deploy!** 🎉 
Push your code and connect the repository in Railway dashboard to get started.
