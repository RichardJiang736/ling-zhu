# Cloudflare Pages Migration Guide

## Summary
Your app has been successfully migrated from Vercel to Cloudflare Pages! 🎉

## Key Benefits
- **100MB file upload limit** (vs Vercel's 4.5MB) - much better for audio files!
- **More generous free tier** with better bandwidth and request limits
- **Global CDN** with excellent performance

## What Changed

### Files Modified
1. **wrangler.toml** - Cloudflare configuration file
2. **next.config.ts** - Updated for Cloudflare compatibility
3. **.gitignore** - Added Cloudflare-specific entries
4. **API routes** - Changed runtime from 'edge' to 'nodejs' for Node.js compatibility

### Files Created
1. **public/_routes.json** - Cloudflare routing configuration
2. **.dev.vars** - Local development environment variables

### Files Removed
1. **vercel.json** - No longer needed

## Deployment Instructions

### 1. Install Wrangler CLI (if not already installed)
```bash
npm install -g wrangler
```

### 2. Login to Cloudflare
```bash
wrangler login
```

### 3. Build Your Project
```bash
npm run pages:build
```

### 4. Preview Locally (Optional)
```bash
npm run preview
```

### 5. Deploy to Cloudflare Pages
```bash
npm run deploy
```

Or use the Cloudflare Dashboard:
1. Go to https://dash.cloudflare.com
2. Navigate to Pages
3. Click "Create a project"
4. Connect your Git repository
5. Use these build settings:
   - **Build command**: `npm run pages:build`
   - **Build output directory**: `.vercel/output/static`
   - **Environment variables**: None required (unless you add database/auth later)

## Environment Variables

Your app currently doesn't need any environment variables. If you add features later that require them:

### For Local Development
Edit `.dev.vars` file:
```
NODE_ENV=development
DATABASE_URL=your-database-url
```

### For Production
Add in Cloudflare Dashboard:
1. Go to your Pages project
2. Settings → Environment variables
3. Add variables for production

## Important Notes

### File Upload Limits
- Cloudflare Free Tier: **100MB** (updated in API routes)
- Your API routes now check for 100MB instead of 50MB

### Execution Time Limits
- Cloudflare Workers: **30 seconds CPU time** on free tier
- For longer audio processing:
  - Consider upgrading to Workers Paid plan (up to 15 minutes)
  - Or use Cloudflare R2 for async processing

### Node.js APIs
- API routes use `runtime = 'nodejs'` with `nodejs_compat` flag
- This enables Node.js APIs like:
  - `Buffer`
  - `fs` (file system)
  - `child_process` (for ffmpeg)
  - `sherpa-onnx` native modules

## Testing Your Deployment

After deploying, test these endpoints:
1. Visit your homepage - should load normally
2. Upload an audio file for diarization
3. Try the "导出分段" (export segments) feature

## Troubleshooting

### Build Fails
- Ensure all dependencies are in `package.json`
- Check Node.js version compatibility (Cloudflare uses Node 20+)

### API Route Timeouts
- If processing takes >30 seconds, consider:
  - Splitting large files into chunks
  - Using Cloudflare Workers Unbound (paid)
  - Implementing R2 storage with async processing

### ONNX Models Not Found
- Ensure model files are in the correct paths:
  - `./sherpa-onnx/sherpa-onnx-pyannote-segmentation-3-0/model.onnx`
  - `./sherpa-onnx/3dspeaker_speech_eres2net_base_sv_zh-cn_3dspeaker_16k.onnx`

### Python Dependencies
- If using Python scripts (sepformer-python-service.py):
  - May need to bundle Python runtime or
  - Consider converting to pure JavaScript/WASM

## Next Steps

1. **Test locally**: Run `npm run preview`
2. **Deploy**: Run `npm run deploy`
3. **Configure custom domain** (optional) in Cloudflare Dashboard
4. **Monitor**: Check Cloudflare Analytics for usage stats

## Resources

- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [Next.js on Cloudflare](https://developers.cloudflare.com/pages/framework-guides/nextjs/)
- [@cloudflare/next-on-pages](https://github.com/cloudflare/next-on-pages)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/)

---

**Need Help?** The migration is complete! Run `npm run preview` to test locally, then `npm run deploy` when ready.
