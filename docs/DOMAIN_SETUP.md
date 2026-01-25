# Domain Setup Guide for VibeMotionTech

This guide walks you through connecting your custom domain (VibeMotionTech.com) to your VibeMotion deployment on GitHub Pages.

## Overview

VibeMotion uses **GitHub Pages** for hosting. With the GitHub Student Developer Pack, you get free access to GitHub Pages with custom domain support and HTTPS.

## Step 1: Enable GitHub Pages

### In Your Repository Settings

1. Go to your repository: `https://github.com/SammyTourani/VibeMotion`
2. Click **Settings** (gear icon)
3. Scroll down to **Pages** in the left sidebar
4. Under **Source**, select:
   - **Source**: Deploy from a branch → **GitHub Actions**
5. Click **Save**

The GitHub Actions workflow (`.github/workflows/deploy-pages.yml`) will automatically build and deploy your site on every push to `main`.

## Step 2: Add Your Custom Domain in GitHub

1. In **Settings > Pages**, find the **Custom domain** section
2. Enter: `vibemotiontech.com`
3. Click **Save**
4. GitHub will create a `CNAME` file in your repository

**Important:** Check the box for **Enforce HTTPS** (after DNS is configured)

## Step 3: Configure DNS at Your Domain Registrar

You need to add DNS records where you purchased your domain. GitHub Pages supports two configurations:

### Option A: Apex Domain (vibemotiontech.com)

Add these **A records** pointing to GitHub's IP addresses:

| Type | Name | Value |
|------|------|-------|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |

Also add a **CNAME** for www:

| Type | Name | Value |
|------|------|-------|
| CNAME | www | sammytourani.github.io |

### Option B: Subdomain Only (www.vibemotiontech.com)

If you only want to use `www.vibemotiontech.com`:

| Type | Name | Value |
|------|------|-------|
| CNAME | www | sammytourani.github.io |

---

## DNS Configuration by Registrar

### Namecheap

1. Log in → **Domain List** → **Manage** next to your domain
2. Go to **Advanced DNS** tab
3. Delete any existing A records or CNAME for @ and www
4. Add new records:
   - **A Record**: Host = `@`, Value = `185.199.108.153`, TTL = Automatic
   - **A Record**: Host = `@`, Value = `185.199.109.153`, TTL = Automatic
   - **A Record**: Host = `@`, Value = `185.199.110.153`, TTL = Automatic
   - **A Record**: Host = `@`, Value = `185.199.111.153`, TTL = Automatic
   - **CNAME Record**: Host = `www`, Value = `sammytourani.github.io`, TTL = Automatic

### Cloudflare

1. Log in → select your domain
2. Go to **DNS** → **Records**
3. Add records (set Proxy status to **DNS only** / grey cloud):
   - Type = `A`, Name = `@`, IPv4 = `185.199.108.153`
   - Type = `A`, Name = `@`, IPv4 = `185.199.109.153`
   - Type = `A`, Name = `@`, IPv4 = `185.199.110.153`
   - Type = `A`, Name = `@`, IPv4 = `185.199.111.153`
   - Type = `CNAME`, Name = `www`, Target = `sammytourani.github.io`

### GoDaddy

1. Log in → **My Products** → **DNS** next to your domain
2. Click **Add** under Records:
   - Type = `A`, Name = `@`, Value = `185.199.108.153`, TTL = 1 Hour
   - Type = `A`, Name = `@`, Value = `185.199.109.153`, TTL = 1 Hour
   - Type = `A`, Name = `@`, Value = `185.199.110.153`, TTL = 1 Hour
   - Type = `A`, Name = `@`, Value = `185.199.111.153`, TTL = 1 Hour
   - Type = `CNAME`, Name = `www`, Value = `sammytourani.github.io`, TTL = 1 Hour

### Porkbun

1. Log in → **Domain Management** → click your domain
2. Go to **DNS Records**
3. Add the A records and CNAME as shown above

---

## Step 4: Verify DNS Configuration

After adding DNS records:

1. Wait 15-30 minutes for DNS propagation (can take up to 48 hours)
2. Go back to **Settings > Pages** in your GitHub repository
3. GitHub will verify your domain automatically
4. You should see a green checkmark next to your domain

### Test Your DNS

You can verify DNS propagation using these tools:
- [whatsmydns.net](https://www.whatsmydns.net/) - Check A record propagation
- [dnschecker.org](https://dnschecker.org/) - Check DNS records globally

```bash
# Or use terminal
dig vibemotiontech.com +short
# Should return GitHub's IP addresses

dig www.vibemotiontech.com +short
# Should return sammytourani.github.io
```

## Step 5: Enable HTTPS

1. After DNS verification completes, go to **Settings > Pages**
2. Check the box for **Enforce HTTPS**
3. GitHub will automatically provision a free SSL certificate via Let's Encrypt

**Note:** HTTPS may take up to 24 hours to fully activate after DNS is verified.

## Final Result

After setup, your site will be accessible at:
- `https://vibemotiontech.com` (primary)
- `https://www.vibemotiontech.com` (redirects to primary)

---

## Troubleshooting

### "Domain not configured" in GitHub

- Verify DNS records are correct
- Wait longer for DNS propagation
- Try removing and re-adding the custom domain in GitHub settings

### "Certificate not yet created"

- DNS must be fully propagated first
- Wait up to 24 hours after DNS verification
- Ensure HTTPS checkbox is enabled

### Site shows 404

- Check that the GitHub Actions workflow ran successfully
- Go to **Actions** tab and verify the latest deployment
- Ensure the `out/` directory is being created with your built files

### Mixed Content Warnings

- All resources (images, scripts, styles) must use HTTPS
- Update any hardcoded HTTP URLs to HTTPS

---

## Quick Checklist

- [ ] Enable GitHub Pages with GitHub Actions as source
- [ ] Add custom domain in GitHub Pages settings
- [ ] Add 4 A records pointing to GitHub's IPs
- [ ] Add CNAME record for www
- [ ] Wait for DNS propagation (15-30 min)
- [ ] Verify domain in GitHub settings
- [ ] Enable Enforce HTTPS
- [ ] Test `https://vibemotiontech.com`

---

## Useful Links

- [GitHub Pages Custom Domain Documentation](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)
- [Managing a Custom Domain](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
- [Troubleshooting Custom Domains](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/troubleshooting-custom-domains-and-github-pages)
