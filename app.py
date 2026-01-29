#!/usr/bin/env python3
"""
News Bulletin Aggregator Web Interface
Flask application with Quantium branding
"""

import os
import json
import logging
from datetime import datetime, timedelta
from flask import Flask, render_template, request, jsonify, send_file, Response, stream_with_context
from pathlib import Path
from main import NewsBulletinAggregator
from email_sender import EmailSender
from dotenv import load_dotenv

# Security: Load environment variables for SMTP credentials
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__)
app.config['SECRET_KEY'] = 'news-bulletin-aggregator-secret-key'

CONFIG_FILE = Path('config.json')
OUTPUT_DIR = Path('output')

# Default sources (available to all profiles)
DEFAULT_SOURCES = {
    'ABC News Top Stories': {
        'enabled': True,
        'url': 'https://www.abc.net.au/feeds/101858056/podcast.xml',
        'description': 'Australian news headlines (60-90 seconds)',
        'custom': False
    },
    'BBC News 5min': {
        'enabled': True,
        'url': 'https://podcast.voice.api.bbci.co.uk/rss/audio/p002vsmz?api_key=Wbek5zSqxz0Hk1blo5IBqbd9SCWIfNbT',
        'description': 'World news bulletin (5 minutes)',
        'custom': False
    },
    'SBS News Updates': {
        'enabled': True,
        'url': 'https://feeds.sbs.com.au/sbs-news-update',
        'description': 'Australian/World news (morning/midday/evening)',
        'custom': False
    },
    'CNBC Business Update': {
        'enabled': True,
        'url': 'https://feeds.simplecast.com/oloBAvaH',
        'description': 'US market updates (3-5 minutes)',
        'custom': False
    },
    'CommSec Market Update': {
        'enabled': True,
        'url': 'https://www.omnycontent.com/d/playlist/820f09cf-2ace-4180-a92d-aa4c0008f5fb/7ce30ada-3515-4538-a131-afef0177d550/1b3da022-8454-4155-8336-afef0177d567/podcast.rss',
        'description': 'Australian market commentary',
        'custom': False
    },
    'AI News Daily': {
        'enabled': True,
        'url': 'https://ai-news-daily.podigee.io/feed/mp3',
        'description': 'AI technology news (5 minutes)',
        'custom': False
    }
}

# Default configuration with profiles
DEFAULT_CONFIG = {
    'active_profile': 'default',
    'profiles': {
        'default': {
            'name': 'Default',
            'sources': DEFAULT_SOURCES.copy()
        }
    },
    'device_profiles': {}  # Maps device_id -> profile_id
}


def load_config():
    """Load configuration from file or return defaults"""
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE, 'r') as f:
            config = json.load(f)
            # Migrate old config format to new profile-based format
            if 'profiles' not in config:
                config = {
                    'active_profile': 'default',
                    'profiles': {
                        'default': {
                            'name': 'Default',
                            'sources': config.get('sources', DEFAULT_SOURCES.copy())
                        }
                    },
                    'device_profiles': {}
                }
                save_config(config)
            # Add device_profiles if missing
            if 'device_profiles' not in config:
                config['device_profiles'] = {}
                save_config(config)
            return config
    return DEFAULT_CONFIG


def save_config(config):
    """Save configuration to file"""
    with open(CONFIG_FILE, 'w') as f:
        json.dump(config, f, indent=2)


@app.route('/')
def index():
    """Main page"""
    config = load_config()
    active_profile = config['active_profile']
    profile_data = config['profiles'].get(active_profile, config['profiles']['default'])

    return render_template('index.html',
                         config=config,
                         active_profile=active_profile,
                         profile_data=profile_data,
                         profiles=config['profiles'])


@app.route('/api/config', methods=['GET', 'POST'])
def api_config():
    """Get or update configuration"""
    if request.method == 'GET':
        return jsonify(load_config())

    elif request.method == 'POST':
        config = request.json
        save_config(config)
        return jsonify({'status': 'success', 'message': 'Configuration saved'})


@app.route('/api/profiles', methods=['GET', 'POST'])
def api_profiles():
    """List or create profiles"""
    config = load_config()

    if request.method == 'GET':
        return jsonify({
            'active_profile': config['active_profile'],
            'profiles': config['profiles']
        })

    elif request.method == 'POST':
        data = request.json
        profile_id = data.get('id', '').lower().replace(' ', '_')
        profile_name = data.get('name', 'New Profile')

        if not profile_id:
            return jsonify({'status': 'error', 'message': 'Profile ID required'}), 400

        if profile_id in config['profiles']:
            return jsonify({'status': 'error', 'message': 'Profile already exists'}), 400

        # Create new profile with default sources
        config['profiles'][profile_id] = {
            'name': profile_name,
            'sources': DEFAULT_SOURCES.copy()
        }

        save_config(config)
        return jsonify({'status': 'success', 'profile_id': profile_id})


@app.route('/api/profiles/<profile_id>', methods=['DELETE'])
def api_delete_profile(profile_id):
    """Delete a profile"""
    config = load_config()

    if profile_id == 'default':
        return jsonify({'status': 'error', 'message': 'Cannot delete default profile'}), 400

    if profile_id not in config['profiles']:
        return jsonify({'status': 'error', 'message': 'Profile not found'}), 404

    del config['profiles'][profile_id]

    # Switch to default if deleted profile was active
    if config['active_profile'] == profile_id:
        config['active_profile'] = 'default'

    save_config(config)
    return jsonify({'status': 'success'})


@app.route('/api/profiles/<profile_id>/switch', methods=['POST'])
def api_switch_profile(profile_id):
    """Switch active profile"""
    config = load_config()

    if profile_id not in config['profiles']:
        return jsonify({'status': 'error', 'message': 'Profile not found'}), 404

    config['active_profile'] = profile_id
    save_config(config)

    return jsonify({'status': 'success', 'active_profile': profile_id})


@app.route('/api/profiles/<profile_id>/sources', methods=['POST'])
def api_update_sources(profile_id):
    """Update sources for a profile"""
    config = load_config()

    if profile_id not in config['profiles']:
        return jsonify({'status': 'error', 'message': 'Profile not found'}), 404

    sources = request.json.get('sources', {})
    config['profiles'][profile_id]['sources'] = sources
    save_config(config)

    return jsonify({'status': 'success'})


@app.route('/api/profiles/<profile_id>/custom-source', methods=['POST', 'DELETE'])
def api_custom_source(profile_id):
    """Add or remove custom source"""
    config = load_config()

    if profile_id not in config['profiles']:
        return jsonify({'status': 'error', 'message': 'Profile not found'}), 404

    if request.method == 'POST':
        data = request.json
        name = data.get('name')
        url = data.get('url')
        description = data.get('description', '')

        if not name or not url:
            return jsonify({'status': 'error', 'message': 'Name and URL required'}), 400

        # Add custom source to profile
        config['profiles'][profile_id]['sources'][name] = {
            'enabled': True,
            'url': url,
            'description': description,
            'custom': True
        }

        save_config(config)
        return jsonify({'status': 'success', 'source': name})

    elif request.method == 'DELETE':
        source_name = request.json.get('name')

        if not source_name:
            return jsonify({'status': 'error', 'message': 'Source name required'}), 400

        if source_name in config['profiles'][profile_id]['sources']:
            del config['profiles'][profile_id]['sources'][source_name]
            save_config(config)
            return jsonify({'status': 'success'})

        return jsonify({'status': 'error', 'message': 'Source not found'}), 404


@app.route('/api/device/<device_id>/profile', methods=['GET', 'POST'])
def api_device_profile(device_id):
    """Get or set profile for a device"""
    config = load_config()

    if request.method == 'GET':
        # Get profile linked to this device
        profile_id = config.get('device_profiles', {}).get(device_id)
        if profile_id:
            return jsonify({'profile_id': profile_id})
        return jsonify({'profile_id': None})

    elif request.method == 'POST':
        # Link device to profile
        data = request.json
        profile_id = data.get('profile_id')

        if not profile_id:
            return jsonify({'status': 'error', 'message': 'Profile ID required'}), 400

        if profile_id not in config['profiles']:
            return jsonify({'status': 'error', 'message': 'Profile does not exist'}), 404

        # Save device-profile mapping
        if 'device_profiles' not in config:
            config['device_profiles'] = {}

        config['device_profiles'][device_id] = profile_id
        save_config(config)

        return jsonify({'status': 'success', 'device_id': device_id, 'profile_id': profile_id})


@app.route('/api/generate', methods=['POST'])
def api_generate():
    """Generate news bulletin with current configuration"""
    try:
        config = load_config()
        active_profile = config['active_profile']
        profile_data = config['profiles'][active_profile]

        # Create aggregator
        aggregator = NewsBulletinAggregator(output_dir='output')

        # Get enabled sources from active profile
        enabled_sources = {
            name: data['url']
            for name, data in profile_data['sources'].items()
            if data['enabled']
        }
        aggregator.news_sources = enabled_sources

        # Fetch bulletins
        downloaded_files = []
        for source_name, feed_url in enabled_sources.items():
            audio_file = aggregator.fetch_latest_bulletin(source_name, feed_url)
            if audio_file:
                downloaded_files.append(audio_file)

        if not downloaded_files:
            return jsonify({
                'status': 'error',
                'message': 'No audio files were downloaded successfully'
            }), 500

        # Create unique filename with profile name and timestamp
        timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
        profile_slug = active_profile.replace(' ', '_').lower()
        output_filename = f"{profile_slug}_{timestamp}.mp3"

        # Combine bulletins
        output_file = aggregator.combine_audio_files(downloaded_files, output_filename)

        # Cleanup temp files
        aggregator.cleanup_temp_files()

        if output_file:
            return jsonify({
                'status': 'success',
                'message': 'Bulletin generated successfully',
                'file': str(output_file),
                'filename': output_file.name
            })
        else:
            return jsonify({
                'status': 'error',
                'message': 'No audio files were downloaded successfully'
            }), 500

    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500


@app.route('/api/download/<filename>')
def api_download(filename):
    """Download generated bulletin"""
    try:
        file_path = OUTPUT_DIR / filename
        if file_path.exists():
            return send_file(
                str(file_path),
                as_attachment=True,
                download_name=filename,
                mimetype='audio/mpeg'
            )
        else:
            return jsonify({'error': 'File not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/recent-files')
def api_recent_files():
    """Get list of recently generated bulletins"""
    try:
        files = []
        if OUTPUT_DIR.exists():
            for file in sorted(OUTPUT_DIR.glob('*.mp3'), reverse=True)[:10]:
                stat = file.stat()
                files.append({
                    'filename': file.name,
                    'size': stat.st_size,
                    'modified': datetime.fromtimestamp(stat.st_mtime).isoformat()
                })
        return jsonify({'files': files})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/email/<filename>', methods=['POST'])
def api_email_bulletin(filename):
    """Email a generated bulletin to specified recipient"""
    try:
        # Input validation: Sanitize filename to prevent path traversal
        file_path = OUTPUT_DIR / filename

        # Security: Verify file exists and is within output directory
        if not file_path.exists() or not file_path.is_relative_to(OUTPUT_DIR):
            return jsonify({'status': 'error', 'message': 'File not found'}), 404

        # Get profile name from filename (format: profile_timestamp.mp3)
        profile_name = filename.split('_')[0].replace('_', ' ').title()

        # Get recipient email from request body
        data = request.get_json() or {}
        recipient_email = data.get('email')

        # Input validation: Require email address
        if not recipient_email:
            return jsonify({
                'status': 'error',
                'message': 'Email address is required'
            }), 400

        # Initialize email sender
        sender = EmailSender()

        # Check if SMTP credentials are configured
        if not sender.smtp_username or not sender.smtp_password:
            return jsonify({
                'status': 'error',
                'message': 'Email not configured. Please set SMTP credentials in .env file'
            }), 400

        # Send email with bulletin attachment to specified recipient
        success = sender.send_bulletin(file_path, profile_name, recipient_email=recipient_email)

        if success:
            return jsonify({
                'status': 'success',
                'message': f'Bulletin emailed to {recipient_email}'
            })
        else:
            return jsonify({
                'status': 'error',
                'message': 'Failed to send email. Check server logs for details.'
            }), 500

    except Exception as e:
        # Security: Log errors without exposing sensitive data
        logger.error(f"Email API error: {type(e).__name__}")
        return jsonify({
            'status': 'error',
            'message': 'An error occurred while sending email'
        }), 500


@app.route('/player')
def player():
    """Mobile audio player page"""
    return render_template('player.html')


@app.route('/api/latest-bulletin')
def api_latest_bulletin():
    """Get the most recent bulletin for the active profile"""
    try:
        config = load_config()
        active_profile = config['active_profile']

        # Get all MP3 files in output directory
        if not OUTPUT_DIR.exists():
            return jsonify({'error': 'No bulletins available'}), 404

        # Find most recent bulletin file
        mp3_files = sorted(OUTPUT_DIR.glob('*.mp3'), key=lambda f: f.stat().st_mtime, reverse=True)

        if not mp3_files:
            return jsonify({'error': 'No bulletins found'}), 404

        # Get the most recent file
        latest_file = mp3_files[0]
        stat = latest_file.stat()

        # Extract profile name from filename (format: profile_timestamp.mp3 or news_bulletin_date.mp3)
        filename = latest_file.name
        profile_name = active_profile.replace('_', ' ').title()

        # Try to parse date from filename
        try:
            # Format: profile_2026-01-23_12-34-56.mp3
            if '_' in filename:
                parts = filename.replace('.mp3', '').split('_')
                if len(parts) >= 2:
                    # Try to extract date from timestamp
                    date_str = parts[1] if '-' in parts[1] else datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d')
                else:
                    date_str = datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d')
            else:
                date_str = datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d')
        except Exception:
            date_str = datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d')

        return jsonify({
            'filename': filename,
            'profile_name': profile_name,
            'date': date_str,
            'size': stat.st_size,
            'modified': datetime.fromtimestamp(stat.st_mtime).isoformat()
        })

    except Exception as e:
        logger.error(f"Latest bulletin API error: {str(e)}")
        return jsonify({'error': 'Unable to retrieve bulletin'}), 500


@app.route('/api/generate/stream')
def api_generate_stream():
    """Generate bulletin with Server-Sent Events progress updates"""
    def generate():
        try:
            config = load_config()
            active_profile = config['active_profile']
            profile_data = config['profiles'][active_profile]

            # Get enabled sources
            enabled_sources = {
                name: data['url']
                for name, data in profile_data['sources'].items()
                if data['enabled']
            }

            if not enabled_sources:
                yield f"data: {json.dumps({'stage': 'error', 'message': 'No sources enabled'})}\n\n"
                return

            # Create generator and set enabled sources
            generator = NewsBulletinAggregator(output_dir='output')
            generator.news_sources = enabled_sources

            # Generate bulletin
            yield f"data: {json.dumps({'stage': 'fetching', 'message': 'Fetching bulletins from sources'})}\n\n"

            output_file = generator.generate_daily_bulletin()

            if output_file:
                # Rename file to include profile name
                profile_filename = f"{profile_id}_{output_file.name}"
                profile_output = output_file.parent / profile_filename
                output_file.rename(profile_output)

                yield f"data: {json.dumps({'stage': 'complete', 'message': 'Bulletin generated successfully', 'filename': profile_filename})}\n\n"
            else:
                yield f"data: {json.dumps({'stage': 'error', 'message': 'Failed to generate bulletin'})}\n\n"

        except Exception as e:
            logger.error(f"Stream generation error: {str(e)}")
            yield f"data: {json.dumps({'stage': 'error', 'message': str(e)})}\n\n"

    return Response(stream_with_context(generate()), mimetype='text/event-stream')


@app.route('/api/bulletin/<filename>/metadata')
def api_bulletin_metadata(filename):
    """Get metadata for a specific bulletin"""
    try:
        # Security: Prevent path traversal
        file_path = OUTPUT_DIR / filename
        if not file_path.is_relative_to(OUTPUT_DIR):
            return jsonify({'error': 'Invalid filename'}), 400

        metadata_file = OUTPUT_DIR / f"{Path(filename).stem}.json"

        if metadata_file.exists():
            with open(metadata_file, 'r') as f:
                metadata = json.load(f)
            return jsonify(metadata)
        else:
            # Return basic info if no metadata file
            if file_path.exists():
                stat = file_path.stat()
                return jsonify({
                    'generated_at': datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    'sources_attempted': [],
                    'sources_succeeded': [],
                    'sources_failed': []
                })
            else:
                return jsonify({'error': 'Bulletin not found'}), 404

    except Exception as e:
        logger.error(f"Metadata API error: {str(e)}")
        return jsonify({'error': str(e)}), 500


@app.route('/api/test-source', methods=['POST'])
def api_test_source():
    """Test a single RSS source"""
    try:
        data = request.json
        source_name = data.get('name')
        source_url = data.get('url')

        if not source_name or not source_url:
            return jsonify({'status': 'error', 'message': 'Name and URL required'}), 400

        # Create temporary aggregator
        aggregator = NewsBulletinAggregator(output_dir='output')

        # Try to fetch the source
        audio_file = aggregator.fetch_latest_bulletin(source_name, source_url)

        if audio_file and audio_file.exists():
            # Get duration
            try:
                from pydub import AudioSegment
                audio = AudioSegment.from_file(str(audio_file))
                duration = len(audio) / 1000  # seconds

                # Cleanup test file
                audio_file.unlink()

                return jsonify({
                    'status': 'success',
                    'message': f'Source is working ({duration:.0f} seconds)',
                    'duration': duration
                })
            except Exception as e:
                # Cleanup test file
                if audio_file.exists():
                    audio_file.unlink()
                return jsonify({
                    'status': 'error',
                    'message': f'Downloaded but cannot process audio: {str(e)}'
                }), 500
        else:
            return jsonify({
                'status': 'error',
                'message': 'No audio file available from this source'
            }), 404

    except Exception as e:
        logger.error(f"Test source error: {str(e)}")
        return jsonify({
            'status': 'error',
            'message': f'Failed to test source: {str(e)}'
        }), 500


@app.route('/api/cleanup', methods=['POST'])
def api_cleanup():
    """Clean up old bulletin files"""
    try:
        data = request.json or {}
        keep_count = data.get('keep_count', 5)  # Keep last N files
        max_age_days = data.get('max_age_days', 7)  # Delete files older than N days

        if not OUTPUT_DIR.exists():
            return jsonify({'status': 'success', 'deleted': 0, 'kept': 0})

        # Get all MP3 files sorted by modification time (newest first)
        mp3_files = sorted(OUTPUT_DIR.glob('*.mp3'), key=lambda f: f.stat().st_mtime, reverse=True)

        deleted_count = 0
        kept_count = 0
        cutoff_date = datetime.now() - timedelta(days=max_age_days)

        for idx, file in enumerate(mp3_files):
            stat = file.stat()
            file_age = datetime.fromtimestamp(stat.st_mtime)

            # Keep if within keep_count OR newer than max_age_days
            if idx < keep_count or file_age > cutoff_date:
                kept_count += 1
            else:
                # Delete file and its metadata
                file.unlink()
                metadata_file = file.parent / f"{file.stem}.json"
                if metadata_file.exists():
                    metadata_file.unlink()
                deleted_count += 1
                logger.info(f"Cleaned up old bulletin: {file.name}")

        return jsonify({
            'status': 'success',
            'deleted': deleted_count,
            'kept': kept_count,
            'message': f'Deleted {deleted_count} old files, kept {kept_count}'
        })

    except Exception as e:
        logger.error(f"Cleanup error: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/api/storage-info')
def api_storage_info():
    """Get storage usage information"""
    try:
        if not OUTPUT_DIR.exists():
            return jsonify({'total_size': 0, 'file_count': 0, 'files': []})

        mp3_files = list(OUTPUT_DIR.glob('*.mp3'))
        total_size = sum(f.stat().st_size for f in mp3_files)

        files_info = []
        for file in sorted(mp3_files, key=lambda f: f.stat().st_mtime, reverse=True):
            stat = file.stat()
            age_days = (datetime.now() - datetime.fromtimestamp(stat.st_mtime)).days
            files_info.append({
                'filename': file.name,
                'size': stat.st_size,
                'age_days': age_days,
                'modified': datetime.fromtimestamp(stat.st_mtime).isoformat()
            })

        return jsonify({
            'total_size': total_size,
            'file_count': len(mp3_files),
            'files': files_info
        })

    except Exception as e:
        logger.error(f"Storage info error: {str(e)}")
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    # Ensure output directory exists
    OUTPUT_DIR.mkdir(exist_ok=True)

    # Run Flask development server
    app.run(host='0.0.0.0', port=5000, debug=True)
