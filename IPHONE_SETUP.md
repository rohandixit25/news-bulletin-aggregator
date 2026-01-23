# iPhone Setup Guide

This guide explains how to install the News Bulletin Aggregator as a Progressive Web App (PWA) on your iPhone, so you can access it like a native app with one tap from your home screen.

## Features

Once installed, you'll get:

- ✅ **App icon** on your iPhone home screen
- ✅ **One-tap playback** of your latest news bulletin
- ✅ **Lock screen controls** - play/pause/skip from lock screen and Control Center
- ✅ **Background playback** - keeps playing when you switch apps or lock your phone
- ✅ **Offline capability** - player works without internet once bulletin is loaded
- ✅ **No App Store** required - install directly from Safari

## Prerequisites

1. **Server running**: The Flask app must be running and accessible from your iPhone
   - Local network: Use your computer's IP address (e.g., `http://192.168.1.100:5000`)
   - Internet: Use a public URL if deployed to a server

2. **Bulletin available**: At least one bulletin must be generated before using the player

## Installation Steps

### 1. Find Your Server Address

On your computer running the Flask app:

```bash
# macOS/Linux: Find your local IP address
ifconfig | grep "inet " | grep -v 127.0.0.1

# Or use hostname
hostname -I
```

Your server URL will be: `http://YOUR_IP_ADDRESS:5000`

For example: `http://192.168.1.100:5000`

### 2. Open in Safari on iPhone

⚠️ **Important**: You must use Safari. Chrome and Firefox on iOS do not support PWA installation.

1. Open **Safari** on your iPhone
2. Navigate to `http://YOUR_IP_ADDRESS:5000/player`
3. Wait for the page to load completely

### 3. Add to Home Screen

1. Tap the **Share** button (square with up arrow) at the bottom of Safari
2. Scroll down and tap **"Add to Home Screen"**
3. Customize the name if desired (default: "News Bulletin")
4. Tap **"Add"** in the top right

### 4. Open the App

1. Return to your home screen
2. Find the "News Bulletin" app icon (black with yellow Quantium logo)
3. Tap to open - it will launch in full-screen mode without Safari UI

## Using the Player

### First Launch

1. Tap the app icon on your home screen
2. The app will load the latest bulletin automatically
3. Tap the large yellow play button to start playback

### Playback Controls

**On-Screen Controls:**
- **Play/Pause** - Large yellow button in center
- **Skip Back 15s** - Left button with "<<" icon
- **Skip Forward 15s** - Right button with ">>" icon
- **Playback Speed** - Bottom left (cycles: 0.75x, 1.0x, 1.25x, 1.5x, 1.75x, 2.0x)
- **Settings** - Bottom right (returns to main app for configuration)

**Lock Screen Controls:**
When audio is playing, you can control it from:
- **Lock Screen** - Player appears on locked screen
- **Control Center** - Swipe down from top-right on iPhone X+ (or swipe up on older iPhones)
- **AirPods/Headphones** - Use physical controls on headphones

### Progress Bar

- **Tap/drag** the progress bar to jump to any point in the bulletin
- **Current time** shown on left
- **Total duration** shown on right

### Background Playback

The bulletin continues playing when you:
- Lock your iPhone screen
- Switch to another app
- Receive phone calls (audio pauses automatically)

## Troubleshooting

### "Unable to load bulletin"

**Cause**: No bulletin files available or server not accessible

**Solutions**:
1. Ensure Flask app is running: `python3 app.py`
2. Generate a bulletin from the main web interface first
3. Check your iPhone is on the same network as the server
4. Verify the server URL is correct

### App doesn't appear on home screen

**Cause**: PWA not installed correctly

**Solutions**:
1. Make sure you used Safari (not Chrome/Firefox)
2. Ensure you tapped "Add to Home Screen" not "Add Bookmark"
3. Try removing and reinstalling
4. Check you're accessing the `/player` URL, not just `/`

### No lock screen controls

**Cause**: Media Session API not initialised

**Solutions**:
1. Start playing audio first - controls appear once playback begins
2. Ensure you installed via Safari (other browsers don't support Media Session)
3. Try closing and reopening the app

### Audio doesn't play

**Cause**: Browser restrictions or file format issues

**Solutions**:
1. Tap the play button explicitly (iOS requires user gesture for autoplay)
2. Check the bulletin file exists and is a valid MP3
3. Try refreshing the page
4. Check Safari doesn't have "Block All Cookies" enabled (Settings → Safari)

### App shows old bulletin

**Cause**: Caching or newer bulletin not detected

**Solutions**:
1. Pull down to refresh (if implemented)
2. Close app completely and reopen
3. Check a new bulletin was actually generated
4. Clear Safari cache: Settings → Safari → Clear History and Website Data

### Controls not responsive

**Cause**: JavaScript error or slow connection

**Solutions**:
1. Wait for bulletin to fully load (loading spinner disappears)
2. Check browser console for errors (connect Safari to Mac for debugging)
3. Try reloading the page

## Advanced Configuration

### Custom Icon

To use your own app icon instead of the default Quantium logo:

1. Create PNG images in these sizes: 72, 96, 128, 144, 152, 192, 384, 512 pixels (square)
2. Replace files in `static/icons/` directory
3. Regenerate with: `python3 generate_icons.py`
4. Remove and reinstall the app on iPhone

### Change App Name

Edit `static/manifest.json`:

```json
{
  "name": "My Custom News",
  "short_name": "News"
}
```

Then reinstall the app on iPhone.

### Change Theme Colour

The theme colour affects the status bar. Edit `static/manifest.json`:

```json
{
  "theme_color": "#FFE600",
  "background_color": "#FFE600"
}
```

Black (#000000) is used by default for a sleek look.

## Remote Access (Optional)

To access from anywhere (not just local network):

### Option 1: ngrok (Easiest for testing)

```bash
# Install ngrok: https://ngrok.com/download
ngrok http 5000

# Use the HTTPS URL provided (e.g., https://abc123.ngrok.io/player)
```

### Option 2: Deploy to Cloud

Deploy the Flask app to:
- **Heroku**: Free tier available, simple deployment
- **Railway**: Modern platform, easy setup
- **DigitalOcean**: VPS for full control
- **AWS/GCP/Azure**: Enterprise options

Update the URLs in your iPhone to use the deployed domain.

### Option 3: Home VPN

Set up a VPN to your home network:
- Use your router's built-in VPN (if available)
- Install WireGuard or OpenVPN on a Raspberry Pi
- Access via VPN even when away from home

## Security Considerations

**Local Network Only:**
- Server binding to `0.0.0.0:5000` allows access from any device on your network
- Not exposed to internet unless you explicitly forward the port
- Safe for home use

**Public Deployment:**
If you deploy publicly, add:
- HTTPS (required for PWA on HTTPS domains)
- Authentication (username/password)
- Firewall rules to restrict access
- Regular security updates

**Private Bulletins:**
- Bulletin content is not encrypted during transmission over local network
- For sensitive content, use HTTPS even on local network
- Don't share your deployed URL publicly if bulletins contain personal information

## Daily Usage Tips

### Morning Routine

1. **Automatic Generation**: Set up cron job to generate bulletin daily at 6 AM
   ```bash
   0 6 * * * cd /workspace/news_bulletin_aggregator && curl -X POST http://localhost:5000/api/generate
   ```

2. **Wake Up**: Tap the app icon on your iPhone

3. **One-Tap Playback**: Latest bulletin starts immediately

4. **Hands-Free**: Lock screen or switch apps - audio continues playing

### Commute

- **AirPods**: Controls work with AirPods Pro/Max play/pause
- **CarPlay**: If supported by your car, appears as audio source
- **Siri**: "Play" / "Pause" / "Skip forward 15 seconds"

### Customisation

- **Adjust Speed**: Tap speed control to listen faster (2x saves time)
- **Skip Ads**: If any bulletins have intro music, skip forward
- **Replay**: Skip back 15s to rehear important points

## Uninstalling

To remove the app from your iPhone:

1. Long-press the app icon on home screen
2. Tap **"Remove App"**
3. Select **"Delete App"**

This removes the icon but doesn't affect:
- Your profile settings on the server
- Generated bulletin files
- The Flask web interface

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review browser console logs (Safari → Develop → iPhone)
3. Check Flask server logs: `tail -f /tmp/flask_app.log`
4. Verify network connectivity
5. Try generating a new bulletin from the web interface first

## Next Steps

Once installed:
- Configure your news sources from the main web interface (`http://YOUR_IP:5000/`)
- Create profiles for other family members
- Set up automated daily generation
- Share the installation link with others on your network

Enjoy your personalised daily news briefing! 📻
