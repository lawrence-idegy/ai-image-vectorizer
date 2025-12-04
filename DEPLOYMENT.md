# Deployment Guide - idegy AI Image Vectorizer

## Quick Deploy to Vercel

### Prerequisites
- Vercel account (sign up at https://vercel.com)
- Vercel CLI installed (already installed ✓)
- Replicate API token (https://replicate.com/account/api-tokens)

### Step 1: Login to Vercel
```bash
vercel login
```

### Step 2: Deploy
```bash
vercel
```

Follow the prompts:
- Set up and deploy? **Yes**
- Which scope? Choose your account
- Link to existing project? **No**
- Project name? **idegy-vectorizer** (or your preferred name)
- Directory? **./** (current directory)
- Override settings? **No**

### Step 3: Set Environment Variables
After deployment, set the required environment variable:

```bash
vercel env add REPLICATE_API_TOKEN
```

Enter your Replicate API token when prompted.
Select all environments (Production, Preview, Development).

### Step 4: Deploy to Production
```bash
vercel --prod
```

## Environment Variables Required

### Production
- `REPLICATE_API_TOKEN` - Your Replicate API token
- `NODE_ENV` - Set to "production" (auto-set by Vercel)
- `PORT` - Auto-assigned by Vercel

## Post-Deployment

### Access Your App
Your app will be available at:
- **Production**: `https://your-project-name.vercel.app`
- **Custom Domain**: Configure in Vercel dashboard

### Verify Deployment
1. Visit your deployment URL
2. Check `/api/health` endpoint
3. Test image upload and vectorization

## Alternative: Deploy via GitHub

### Option 1: Push to GitHub
```bash
# Create a new repository on GitHub
# Then run:
git remote add origin https://github.com/yourusername/your-repo.git
git branch -M main
git push -u origin main
```

### Option 2: Connect Vercel to GitHub
1. Go to https://vercel.com/new
2. Import your GitHub repository
3. Vercel will auto-detect the configuration
4. Add environment variables in the Vercel dashboard
5. Deploy!

## Monitoring

### Check Logs
```bash
vercel logs
```

### View Deployments
```bash
vercel ls
```

## Troubleshooting

### Build Fails
- Ensure all dependencies are in package.json
- Check build logs: `vercel logs`
- Verify Node.js version compatibility

### API Errors
- Verify REPLICATE_API_TOKEN is set
- Check environment variable spelling
- Review function logs in Vercel dashboard

### Upload Issues
- Vercel has file size limits for serverless functions
- Large uploads may need edge runtime configuration
- Consider using external storage (S3, Cloudinary) for production

## Performance Optimization

### Recommendations
1. **Caching**: Enable Vercel's edge caching
2. **CDN**: Static assets served via Vercel CDN automatically
3. **Image Optimization**: Consider Vercel Image Optimization
4. **Database**: Add persistent storage for uploads if needed

## Security

### Best Practices
- Never commit `.env` file
- Rotate API tokens regularly
- Use Vercel's environment variable encryption
- Enable CORS only for trusted domains in production
- Set up rate limiting for API endpoints

## Scaling

### Current Setup
- Serverless functions auto-scale
- Frontend served via global CDN
- No persistent storage (uploads/output are temporary)

### For High Traffic
1. Add Redis for caching
2. Use external storage (AWS S3)
3. Implement queue system for batch processing
4. Consider upgrading Vercel plan

## Cost Considerations

### Free Tier Limits
- 100GB bandwidth/month
- 100 hours serverless function execution
- Unlimited deployments
- 6,000 build minutes

### Replicate API Costs
- Pay per prediction
- Monitor usage at https://replicate.com/account

## Support

### Resources
- Vercel Documentation: https://vercel.com/docs
- Replicate Documentation: https://replicate.com/docs
- Project Issues: Create GitHub issue

### Quick Commands
```bash
vercel --help          # Show all commands
vercel env ls          # List environment variables
vercel domains         # Manage custom domains
vercel rollback        # Rollback to previous deployment
```
