# Domain Setup Guide for VibeMotionTech

This guide walks you through connecting your custom domain (VibeMotionTech.com) to your VibeMotion deployment.

## Overview

Since VibeMotion is a full-stack Next.js application with API routes, you need a hosting platform that supports server-side rendering. **GitHub Pages only supports static sites**, so we recommend **Vercel** (built by the creators of Next.js).

## Step 1: Deploy to Vercel

### Option A: Deploy via GitHub Integration (Recommended)

1. Go to [vercel.com](https://vercel.com) and sign up/log in with your GitHub account
2. Click **"Add New..."** → **"Project"**
3. Select your **VibeMotion** repository from GitHub
4. Vercel auto-detects Next.js - click **"Deploy"**
5. Wait for the build to complete (~2-3 minutes)

### Option B: Deploy via CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy from project directory
cd /path/to/VibeMotion
vercel

# Follow the prompts
```

### Add Environment Variables

In Vercel Dashboard:
1. Go to your project → **Settings** → **Environment Variables**
2. Add your API keys:
   - `OPENAI_API_KEY` = your OpenAI key
   - `REPLICATE_API_TOKEN` = your Replicate key (optional)
   - `ELEVENLABS_API_KEY` = your ElevenLabs key (optional)

## Step 2: Register Your Domain

If you haven't already purchased **VibeMotionTech.com**, here are popular registrars:

| Registrar | Price (approx.) | Notes |
|-----------|----------------|-------|
| [Namecheap](https://namecheap.com) | $10-12/year | Good value, free WHOIS privacy |
| [Cloudflare Registrar](https://cloudflare.com) | At-cost (~$9/year) | No markup, best value |
| [Google Domains](https://domains.google) | $12/year | Simple interface |
| [GoDaddy](https://godaddy.com) | $12-15/year | Widely used |
| [Porkbun](https://porkbun.com) | $9-10/year | Affordable with free privacy |

### Registration Steps (General)

1. Search for `vibemotiontech.com` on the registrar
2. Add to cart and checkout
3. Complete payment
4. Verify your email (required by ICANN)
5. Access your domain's DNS settings

## Step 3: Connect Domain to Vercel

### In Vercel Dashboard

1. Go to your project → **Settings** → **Domains**
2. Click **"Add"**
3. Enter: `vibemotiontech.com`
4. Click **"Add"**
5. Vercel will show you the DNS records to configure

### DNS Records to Add

Vercel will provide specific records, but typically you need:

#### Option A: Using Vercel's Nameservers (Easiest)

Change your domain's nameservers to Vercel's:
```
ns1.vercel-dns.com
ns2.vercel-dns.com
```

#### Option B: Using A/CNAME Records (More Control)

Add these records at your registrar:

| Type | Name | Value |
|------|------|-------|
| A | @ | 76.76.21.21 |
| CNAME | www | cname.vercel-dns.com |

### DNS Configuration by Registrar

#### Namecheap

1. Log in → **Domain List** → click **Manage** next to your domain
2. Go to **Advanced DNS** tab
3. Add the records:
   - **A Record**: Host = `@`, Value = `76.76.21.21`, TTL = Automatic
   - **CNAME Record**: Host = `www`, Value = `cname.vercel-dns.com`, TTL = Automatic

#### Cloudflare

1. Log in → select your domain
2. Go to **DNS** → **Records**
3. Click **Add record**:
   - Type = `A`, Name = `@`, IPv4 = `76.76.21.21`, Proxy = DNS only
   - Type = `CNAME`, Name = `www`, Target = `cname.vercel-dns.com`, Proxy = DNS only

#### GoDaddy

1. Log in → **My Products** → **DNS** next to your domain
2. Click **Add** under Records:
   - Type = `A`, Name = `@`, Value = `76.76.21.21`, TTL = 1 Hour
   - Type = `CNAME`, Name = `www`, Value = `cname.vercel-dns.com`, TTL = 1 Hour

## Step 4: Verify Domain Connection

1. After adding DNS records, go back to Vercel
2. Click **"Refresh"** on the Domains page
3. Vercel will verify the DNS records
4. Once verified, you'll see a green checkmark

**Note:** DNS propagation can take up to 48 hours, but usually completes within 15-30 minutes.

## Step 5: Enable HTTPS (Automatic)

Vercel automatically provisions a free SSL certificate for your domain. No action needed!

## Final Result

After setup, your site will be accessible at:
- `https://vibemotiontech.com` (primary)
- `https://www.vibemotiontech.com` (redirects to primary)

## Troubleshooting

### Domain shows "Invalid Configuration"

- Wait 15-30 minutes for DNS propagation
- Double-check the DNS records match exactly what Vercel shows
- Clear your browser cache and try again

### "DNS_PROBE_FINISHED_NXDOMAIN" Error

- DNS hasn't propagated yet - wait longer
- Verify you added the records to the correct domain

### SSL Certificate Not Working

- Vercel handles this automatically, but it can take up to 24 hours
- If issues persist, contact Vercel support

## Alternative: Railway or Render

If you prefer alternatives to Vercel:

### Railway
1. Go to [railway.app](https://railway.app)
2. Connect GitHub repository
3. Railway auto-detects Next.js
4. Add custom domain in project settings

### Render
1. Go to [render.com](https://render.com)
2. Create new Web Service
3. Connect GitHub repository
4. Add custom domain in settings

---

## Quick Checklist

- [ ] Deploy to Vercel
- [ ] Add environment variables in Vercel
- [ ] Register/verify you own VibeMotionTech.com
- [ ] Add DNS records at your registrar
- [ ] Verify domain in Vercel dashboard
- [ ] Test `https://vibemotiontech.com`

---

**Questions?** Open an issue on GitHub or check [Vercel's domain documentation](https://vercel.com/docs/concepts/projects/domains).
