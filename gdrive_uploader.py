#!/usr/bin/env python3
"""
Google Drive uploader for news bulletins.
Uploads generated MP3 files to a specified Google Drive folder.

Credentials can be provided via:
- JSON files: gdrive_credentials.json + gdrive_token.json (local dev)
- Env vars: GDRIVE_TOKEN (for Render/cloud deployment)
"""

import json
import logging
import os
from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

logger = logging.getLogger(__name__)

SCOPES = ['https://www.googleapis.com/auth/drive.file']
BASE_DIR = Path(__file__).parent
CREDENTIALS_FILE = BASE_DIR / 'gdrive_credentials.json'
TOKEN_FILE = BASE_DIR / 'gdrive_token.json'


class GDriveUploader:
    """Uploads files to a Google Drive folder."""

    def __init__(self):
        self.service = None

    def _authenticate(self):
        """Authenticate with Google Drive API using OAuth2.
        Checks env var GDRIVE_TOKEN first, then falls back to token file."""
        creds = None

        # Try env var first (for cloud deployment)
        gdrive_token_env = os.environ.get('GDRIVE_TOKEN')
        if gdrive_token_env:
            try:
                token_data = json.loads(gdrive_token_env)
                creds = Credentials.from_authorized_user_info(token_data, SCOPES)
            except Exception as e:
                logger.error(f"Failed to parse GDRIVE_TOKEN env var: {e}")

        # Fall back to token file
        if not creds and TOKEN_FILE.exists():
            creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)

        if not creds or not creds.valid:
            if creds and creds.expired and creds.refresh_token:
                creds.refresh(Request())
                # Save refreshed token back to file if using file-based auth
                if not gdrive_token_env:
                    with open(TOKEN_FILE, 'w') as f:
                        f.write(creds.to_json())
            else:
                if not CREDENTIALS_FILE.exists():
                    logger.error(
                        "No Google Drive credentials available. "
                        "Set GDRIVE_TOKEN env var or provide "
                        "gdrive_credentials.json"
                    )
                    return False

                flow = InstalledAppFlow.from_client_secrets_file(
                    str(CREDENTIALS_FILE), SCOPES
                )
                creds = flow.run_local_server(
                    host='localhost',
                    bind_addr='0.0.0.0',
                    port=8090,
                    open_browser=False,
                    prompt='consent',
                    access_type='offline'
                )

                with open(TOKEN_FILE, 'w') as f:
                    f.write(creds.to_json())

        self.service = build('drive', 'v3', credentials=creds)
        return True

    def _find_or_create_folder(self, folder_name, parent_id=None):
        """Find a folder by name, or create it if it doesn't exist."""
        query = (
            f"name = '{folder_name}' and "
            f"mimeType = 'application/vnd.google-apps.folder' and "
            f"trashed = false"
        )
        if parent_id:
            query += f" and '{parent_id}' in parents"

        results = self.service.files().list(
            q=query, spaces='drive', fields='files(id, name)', pageSize=1
        ).execute()

        files = results.get('files', [])
        if files:
            return files[0]['id']

        # Create folder
        metadata = {
            'name': folder_name,
            'mimeType': 'application/vnd.google-apps.folder'
        }
        if parent_id:
            metadata['parents'] = [parent_id]

        folder = self.service.files().create(
            body=metadata, fields='id'
        ).execute()

        logger.info(f"Created Google Drive folder: {folder_name}")
        return folder.get('id')

    # MIME types inferred from extension for non-audio uploads
    _MIMETYPES = {
        '.mp3': 'audio/mpeg',
        '.md': 'text/markdown',
        '.json': 'application/json',
        '.txt': 'text/plain',
    }

    def upload(self, file_path, folder_name='News', folder_id=None):
        """
        Upload a file to the specified Google Drive folder.

        Args:
            file_path: Path to the file to upload
            folder_name: Name of the Drive folder (used only if folder_id not set)
            folder_id: Explicit Drive folder ID (preferred over folder_name)

        Returns:
            File ID on success, None on failure
        """
        file_path = Path(file_path)
        if not file_path.exists():
            logger.error(f"File not found: {file_path}")
            return None

        try:
            if not self.service and not self._authenticate():
                return None

            if not folder_id:
                folder_id = self._find_or_create_folder(folder_name)

            mimetype = self._MIMETYPES.get(
                file_path.suffix.lower(), 'application/octet-stream'
            )

            file_metadata = {
                'name': file_path.name,
                'parents': [folder_id]
            }

            media = MediaFileUpload(
                str(file_path),
                mimetype=mimetype,
                resumable=True
            )

            uploaded = self.service.files().create(
                body=file_metadata,
                media_body=media,
                fields='id, name, webViewLink'
            ).execute()

            logger.info(
                f"Uploaded to Google Drive: {uploaded.get('name')} "
                f"({uploaded.get('webViewLink')})"
            )
            return uploaded.get('id')

        except Exception as e:
            logger.error(f"Google Drive upload failed: {e}")
            return None

    def cleanup_folder(self, folder_id, name_prefix=None, keep_newest=0):
        """
        Delete files from a Drive folder before uploading new ones.

        Args:
            folder_id: Drive folder ID to clean
            name_prefix: Only delete files whose name starts with this prefix
                (None = delete all files in the folder, ignoring subfolders)
            keep_newest: Keep the N most recently modified matching files

        Returns:
            Count of files deleted (or -1 on error)
        """
        if not folder_id:
            logger.warning("cleanup_folder called without folder_id")
            return -1

        try:
            if not self.service and not self._authenticate():
                return -1

            # Security: parameterise query, never concatenate user-provided strings
            # into the q= clause — Drive's query language allows injection of
            # additional filters otherwise (CWE-89-equivalent).
            safe_folder = str(folder_id).replace("'", "")
            query = (
                f"'{safe_folder}' in parents and trashed = false and "
                f"mimeType != 'application/vnd.google-apps.folder'"
            )

            files = []
            page_token = None
            while True:
                resp = self.service.files().list(
                    q=query,
                    spaces='drive',
                    fields='nextPageToken, files(id, name, modifiedTime)',
                    pageSize=100,
                    pageToken=page_token,
                ).execute()
                files.extend(resp.get('files', []))
                page_token = resp.get('nextPageToken')
                if not page_token:
                    break

            if name_prefix:
                files = [f for f in files if f.get('name', '').startswith(name_prefix)]

            # Sort newest first; keep N newest
            files.sort(key=lambda f: f.get('modifiedTime', ''), reverse=True)
            to_delete = files[keep_newest:]

            deleted = 0
            for f in to_delete:
                try:
                    self.service.files().delete(fileId=f['id']).execute()
                    logger.info("Deleted old bulletin: %s", f.get('name'))
                    deleted += 1
                except Exception as e:
                    logger.warning("Failed to delete %s: %s", f.get('name'), e)

            return deleted

        except Exception as e:
            logger.error(f"Cleanup failed: {e}")
            return -1
