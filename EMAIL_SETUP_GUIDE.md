# Email Setup Guide

This guide will help you configure email delivery for the News Bulletin Aggregator.

## Prerequisites

- A Gmail account (or other SMTP-compatible email service)
- For Gmail: 2-Factor Authentication enabled

## Gmail Setup (Recommended)

### Step 1: Enable 2-Factor Authentication

1. Go to [Google Account Security](https://myaccount.google.com/security)
2. Click on "2-Step Verification"
3. Follow the steps to enable 2FA

### Step 2: Generate App Password

1. Go to [App Passwords](https://myaccount.google.com/apppasswords)
2. Select "Mail" as the app
3. Select "Other (Custom name)" as the device
4. Enter "News Bulletin Aggregator"
5. Click "Generate"
6. **Copy the 16-character password** (you won't see it again)

### Step 3: Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` file with your credentials:
   ```bash
   SMTP_SERVER=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USERNAME=your.email@gmail.com
   SMTP_PASSWORD=xxxx xxxx xxxx xxxx  # The 16-character app password
   RECIPIENT_EMAIL=recipient@example.com
   SENDER_NAME=News Bulletin Aggregator
   ```

3. **Important**: The `.env` file is already in `.gitignore` and will not be committed to version control

## Alternative SMTP Providers

### Outlook/Office 365

```bash
SMTP_SERVER=smtp.office365.com
SMTP_PORT=587
SMTP_USERNAME=your.email@outlook.com
SMTP_PASSWORD=your_password
```

### Other SMTP Servers

Update `.env` with your provider's SMTP settings:
- Check your email provider's documentation for SMTP server address and port
- Most providers use port 587 for TLS or port 465 for SSL

## Testing Email Configuration

Run the email sender module directly to test your configuration:

```bash
cd /workspace/news_bulletin_aggregator
python3 email_sender.py
```

You should see:
```
✅ Email configuration is valid
   SMTP Server: smtp.gmail.com:587
   From: your.email@gmail.com
   To: recipient@example.com
```

## Using Email Delivery

Once configured, you can email bulletins directly from the web interface:

1. Generate a bulletin using the "Generate Bulletin" button
2. In the "Recent Bulletins" section, click the **"Email"** button next to any bulletin
3. The bulletin will be sent as an MP3 attachment to the configured recipient email

## Troubleshooting

### "Email not configured" error
- Verify `.env` file exists in the project root
- Ensure all required variables are set (SMTP_USERNAME, SMTP_PASSWORD, RECIPIENT_EMAIL)
- Restart the Flask server after editing `.env`

### "SMTP authentication failed" error
- For Gmail: Verify you're using an **App Password**, not your regular password
- Check that 2-Factor Authentication is enabled
- Verify the username is your full email address

### "Connection refused" error
- Check SMTP server address and port
- Verify your network allows outbound SMTP connections (port 587)
- Some corporate networks block SMTP; try a different network

### Bulletin file too large (>25MB)
- The email system limits attachments to 25MB
- This typically allows bulletins up to 3-4 hours duration
- If you need longer bulletins, use the Download option instead

## Security Best Practices

- **Never commit your `.env` file** to version control
- Use App Passwords instead of your main account password
- Rotate App Passwords periodically
- Use a dedicated email account for sending if possible
- Monitor your email account for unusual activity

## Support

For Gmail-specific issues, visit:
- [Gmail SMTP settings](https://support.google.com/mail/answer/7126229)
- [App Passwords help](https://support.google.com/accounts/answer/185833)
