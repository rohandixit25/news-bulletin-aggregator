#!/usr/bin/env python3
"""
Email Sender Module for News Bulletin Aggregator
Sends generated bulletins via SMTP with secure TLS encryption
"""

import os
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class EmailSender:
    """Handles secure email delivery of news bulletins"""

    def __init__(self):
        # Security: Load credentials from environment variables, never hardcode
        self.smtp_server = os.environ.get('SMTP_SERVER', 'smtp.gmail.com')
        self.smtp_port = int(os.environ.get('SMTP_PORT', '587'))
        self.smtp_username = os.environ.get('SMTP_USERNAME')
        self.smtp_password = os.environ.get('SMTP_PASSWORD')
        self.recipient_email = os.environ.get('RECIPIENT_EMAIL')
        self.sender_name = os.environ.get('SENDER_NAME', 'News Bulletin Aggregator')

    def is_configured(self) -> bool:
        """Check if email configuration is complete"""
        return all([
            self.smtp_username,
            self.smtp_password,
            self.recipient_email
        ])

    def send_bulletin(self, bulletin_path: Path, profile_name: str = "Default", recipient_email: Optional[str] = None) -> bool:
        """
        Send news bulletin via email with MP3 attachment

        Args:
            bulletin_path: Path to the MP3 file to send
            profile_name: Name of the profile that generated this bulletin
            recipient_email: Optional recipient email address. If not provided, uses RECIPIENT_EMAIL from .env

        Returns:
            bool: True if email sent successfully, False otherwise
        """
        # Determine recipient email: use parameter if provided, otherwise fall back to config
        recipient = recipient_email if recipient_email else self.recipient_email

        # Input validation: Verify recipient email is provided
        if not recipient:
            logger.error("No recipient email provided and RECIPIENT_EMAIL not set in .env")
            return False

        # Input validation: Basic email format check (prevent injection)
        if not self._is_valid_email(recipient):
            logger.error(f"Invalid email address format: {recipient}")
            return False

        # Check SMTP credentials are configured
        if not self.smtp_username or not self.smtp_password:
            logger.error("SMTP credentials not configured. Set SMTP_USERNAME and SMTP_PASSWORD in .env file")
            return False

        # Input validation: Verify file exists and is readable
        if not bulletin_path.exists():
            logger.error(f"Bulletin file not found: {bulletin_path}")
            return False

        # Security: Limit attachment size to prevent resource exhaustion (25MB max)
        file_size_mb = bulletin_path.stat().st_size / (1024 * 1024)
        if file_size_mb > 25:
            logger.error(f"Bulletin file too large: {file_size_mb:.1f}MB (max 25MB)")
            return False

        try:
            # Create multipart message
            msg = MIMEMultipart()
            msg['From'] = f"{self.sender_name} <{self.smtp_username}>"
            msg['To'] = recipient
            msg['Subject'] = f"News Bulletin - {profile_name}"

            # Email body with HTML formatting
            duration_str = self._format_duration(bulletin_path)
            html_body = f"""
            <html>
                <body style="font-family: Roboto, Arial, sans-serif; color: #333;">
                    <h2 style="color: #3f69ae;">Your News Bulletin is Ready</h2>
                    <p>Your personalised news bulletin for <strong>{profile_name}</strong> has been generated.</p>

                    <div style="background-color: #f7f7f7; padding: 16px; border-radius: 3px; margin: 16px 0;">
                        <p style="margin: 0;"><strong>File:</strong> {bulletin_path.name}</p>
                        <p style="margin: 8px 0 0 0;"><strong>Duration:</strong> {duration_str}</p>
                        <p style="margin: 8px 0 0 0;"><strong>Size:</strong> {file_size_mb:.1f} MB</p>
                    </div>

                    <p>The bulletin is attached to this email. Download and listen at your convenience.</p>

                    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;">
                    <p style="font-size: 0.875rem; color: #676d70;">
                        News Bulletin Aggregator &copy; 2026
                    </p>
                </body>
            </html>
            """

            # Security: Use text/html content type with proper encoding to prevent XSS
            msg.attach(MIMEText(html_body, 'html', 'utf-8'))

            # Attach the MP3 file
            with open(bulletin_path, 'rb') as attachment_file:
                part = MIMEBase('audio', 'mpeg')
                part.set_payload(attachment_file.read())

            # Security: Encode attachment in base64 for safe transmission
            encoders.encode_base64(part)

            # Input validation: Sanitize filename to prevent path traversal
            safe_filename = Path(bulletin_path.name).name
            part.add_header(
                'Content-Disposition',
                f'attachment; filename="{safe_filename}"'
            )
            msg.attach(part)

            # Security: Use TLS encryption for SMTP connection
            logger.info(f"Connecting to SMTP server: {self.smtp_server}:{self.smtp_port}")
            with smtplib.SMTP(self.smtp_server, self.smtp_port, timeout=30) as server:
                # Enable TLS encryption
                server.starttls()

                # Security: Authenticate with server (credentials from environment)
                # Note: Never log credentials or tokens
                server.login(self.smtp_username, self.smtp_password)

                # Send email
                server.send_message(msg)

            logger.info(f"Email sent successfully to {recipient}")
            return True

        except smtplib.SMTPAuthenticationError:
            logger.error("SMTP authentication failed. Check username/password")
            return False
        except smtplib.SMTPException as e:
            logger.error(f"SMTP error: {e}")
            return False
        except Exception as e:
            # Security: Log errors without exposing sensitive data
            logger.error(f"Failed to send email: {type(e).__name__}")
            return False

    def _is_valid_email(self, email: str) -> bool:
        """
        Basic email validation to prevent injection attacks

        Args:
            email: Email address to validate

        Returns:
            bool: True if email format is valid, False otherwise
        """
        import re

        # Security: Basic email format validation (RFC 5322 simplified)
        # Prevents injection of newlines, special characters that could be exploited
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'

        if not email or len(email) > 254:  # RFC 5321 max email length
            return False

        return bool(re.match(email_pattern, email))

    def _format_duration(self, audio_path: Path) -> str:
        """Get audio file duration using pydub"""
        try:
            from pydub import AudioSegment
            audio = AudioSegment.from_mp3(str(audio_path))
            duration_minutes = len(audio) / (1000 * 60)
            return f"{duration_minutes:.1f} minutes"
        except Exception:
            return "Unknown"


if __name__ == '__main__':
    # Test email configuration
    from dotenv import load_dotenv
    load_dotenv()

    sender = EmailSender()
    if sender.is_configured():
        print("✅ Email configuration is valid")
        print(f"   SMTP Server: {sender.smtp_server}:{sender.smtp_port}")
        print(f"   From: {sender.smtp_username}")
        print(f"   To: {sender.recipient_email}")
    else:
        print("❌ Email not configured. Set credentials in .env file")
