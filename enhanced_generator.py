#!/usr/bin/env python3
"""
Enhanced News Bulletin Generator with progress tracking, parallel downloads,
audio normalisation, chapter markers, and graceful error handling.
"""

import json
import logging
import re
import shutil
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path
from queue import Queue
from typing import Dict, Generator

from pydub import AudioSegment

from main import NewsBulletinAggregator

logger = logging.getLogger(__name__)


class EnhancedBulletinGenerator(NewsBulletinAggregator):
    """Enhanced aggregator with progress tracking, parallel downloads,
    and chapter markers."""

    def __init__(self, output_dir='./output'):
        super().__init__(output_dir)
        self.metadata = {
            'sources_attempted': [],
            'sources_succeeded': [],
            'sources_failed': [],
            'total_duration': 0,
            'generated_at': None,
            'chapters': []
        }

    def _copy_to_gdrive(self, output_path: Path, config=None):
        """Upload bulletin to Google Drive via API,
        or copy to local sync folder as fallback."""
        if config is None:
            from app import load_config
            config = load_config()

        # Try Drive API upload first
        try:
            from gdrive_uploader import GDriveUploader
            folder_id = config.get('gdrive_folder_id')
            uploader = GDriveUploader()
            file_id = uploader.upload(
                output_path, folder_name='News', folder_id=folder_id,
            )
            if file_id:
                return
            logger.warning("Drive API upload returned None, trying local copy fallback")
        except Exception as e:
            logger.debug(f"Drive API upload unavailable: {e}")

        # Fallback: local sync folder copy
        gdrive_path = config.get('gdrive_path')
        if not gdrive_path:
            return
        try:
            dest_dir = Path(gdrive_path)
            if not dest_dir.is_dir():
                return
            shutil.copy2(str(output_path), str(dest_dir / output_path.name))
            dest = dest_dir / output_path.name
            logger.info("Copied bulletin to Google Drive: %s", dest)
        except Exception as e:
            logger.warning(f"Failed to copy to Google Drive: {e}")

    def generate_with_progress(
        self,
        enabled_sources: Dict[str, str],
        profile_name: str,
        config=None,
    ) -> Generator[Dict, None, str]:
        """
        Generate bulletin with real-time progress updates.

        Downloads sources in parallel, yields progress events as each completes,
        normalises audio, combines with chapter markers, and saves metadata.

        Yields progress dictionaries with:
        {
            'stage': 'downloading'|'processing'|'complete'|'error'|'warning',
            'source': 'Source Name',
            'message': 'Human readable message',
            'progress': 0-100
        }

        Returns: filename of generated bulletin
        """
        try:
            total_sources = len(enabled_sources)
            source_order = list(enabled_sources.keys())
            downloaded = {}  # source_name -> file_path
            source_metadata = []
            completed_count = 0

            # Stage 1: Download sources in parallel with progress callbacks
            self.metadata['sources_attempted'] = list(enabled_sources.keys())

            yield {
                'stage': 'downloading',
                'message': f'Downloading {total_sources} sources in parallel...',
                'progress': 0
            }

            progress_queue = Queue()

            def _download(source_name, feed_url):
                """Download a single source and put result on queue."""
                try:
                    audio_file = self.fetch_latest_bulletin(source_name, feed_url)
                    progress_queue.put(('done', source_name, audio_file))
                    return source_name, audio_file
                except Exception as e:
                    progress_queue.put(('error', source_name, str(e)))
                    return source_name, None

            with ThreadPoolExecutor(max_workers=4) as executor:
                futures = {
                    executor.submit(_download, name, url): name
                    for name, url in enabled_sources.items()
                }

                for future in as_completed(futures):
                    source_name = futures[future]
                    completed_count += 1
                    progress_pct = int((completed_count / total_sources) * 50)

                    try:
                        name, audio_file = future.result()
                        if audio_file and audio_file.exists():
                            downloaded[name] = audio_file
                            self.metadata['sources_succeeded'].append(name)

                            # Get duration
                            try:
                                audio = AudioSegment.from_file(str(audio_file))
                                duration_sec = len(audio) / 1000
                                source_metadata.append({
                                    'name': name,
                                    'duration': duration_sec,
                                    'file': str(audio_file.name)
                                })
                            except Exception:
                                source_metadata.append({
                                    'name': name,
                                    'duration': 0,
                                    'file': str(audio_file.name)
                                })

                            yield {
                                'stage': 'downloading',
                                'source': name,
                                'message': f'{name} downloaded',
                                'progress': progress_pct
                            }
                        else:
                            self.metadata['sources_failed'].append({
                                'name': name,
                                'reason': 'No audio file returned'
                            })
                            yield {
                                'stage': 'warning',
                                'source': name,
                                'message': f'{name} unavailable, skipping...',
                                'progress': progress_pct
                            }
                    except Exception as e:
                        logger.error(f"Error downloading {source_name}: {str(e)}")
                        self.metadata['sources_failed'].append({
                            'name': source_name,
                            'reason': str(e)
                        })
                        yield {
                            'stage': 'warning',
                            'source': source_name,
                            'message': f'{source_name} failed: {str(e)[:50]}',
                            'progress': progress_pct
                        }

            # Check if we have any files
            if not downloaded:
                yield {
                    'stage': 'error',
                    'message': 'No sources were successfully downloaded',
                    'progress': 50
                }
                return

            # Stage 2: Combine audio with normalisation and chapter markers
            yield {
                'stage': 'processing',
                'message': (
                    f'Combining {len(downloaded)} audio files'
                    ' with normalisation...'
                ),
                'progress': 60
            }

            timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
            slug = profile_name.replace(' ', '_').lower()
            profile_slug = re.sub(r'[^a-z0-9_]', '', slug)
            output_filename = f"{profile_slug}_{timestamp}.mp3"

            try:
                # Build ordered file list respecting source_order
                ordered_files = []
                for name in source_order:
                    if name in downloaded:
                        ordered_files.append((name, downloaded[name]))

                # Combine with normalisation and chapter tracking
                combined = AudioSegment.empty()
                chapters = []
                cumulative_ms = 0

                for name, audio_file in ordered_files:
                    try:
                        segment = AudioSegment.from_file(str(audio_file))
                        segment = self.normalise_audio(segment)
                        duration_ms = len(segment)

                        chapters.append({
                            'name': name,
                            'start_ms': cumulative_ms,
                            'duration_ms': duration_ms
                        })

                        combined += segment

                        # Add 2 second silence between bulletins
                        silence = AudioSegment.silent(duration=2000)
                        combined += silence
                        cumulative_ms += duration_ms + 2000

                    except Exception as e:
                        logger.error(f"Error processing {name}: {str(e)}")
                        continue

                if len(combined) == 0:
                    yield {
                        'stage': 'error',
                        'message': 'Failed to process any audio files',
                        'progress': 70
                    }
                    return

                # Export combined file
                output_path = self.output_dir / output_filename
                combined.export(str(output_path), format='mp3')

                self.metadata['total_duration'] = len(combined) / 1000
                self.metadata['chapters'] = chapters

                # Copy to Google Drive sync folder if configured
                self._copy_to_gdrive(output_path, config=config)

                yield {
                    'stage': 'processing',
                    'message': 'Audio combined and normalised',
                    'progress': 90
                }

            except Exception as e:
                logger.error(f"Error combining audio: {str(e)}")
                yield {
                    'stage': 'error',
                    'message': f'Failed to combine audio: {str(e)}',
                    'progress': 70
                }
                return

            # Stage 3: Save metadata
            yield {
                'stage': 'processing',
                'message': 'Saving metadata...',
                'progress': 95
            }

            self.metadata['generated_at'] = datetime.now().isoformat()
            self.metadata['profile'] = profile_name
            self.metadata['source_details'] = source_metadata

            # Save metadata as JSON alongside the MP3
            metadata_file = output_path.parent / f"{output_path.stem}.json"
            with open(metadata_file, 'w') as f:
                json.dump(self.metadata, f, indent=2)

            # Cleanup temp files
            self.cleanup_temp_files()

            # Stage 4: Complete
            file_size = output_path.stat().st_size
            yield {
                'stage': 'complete',
                'message': (
                    f'Bulletin ready! ({len(downloaded)} sources,'
                    f' {self.metadata["total_duration"]:.1f}s)'
                ),
                'progress': 100,
                'filename': output_filename,
                'size': file_size,
                'metadata': self.metadata
            }

            return output_filename

        except Exception as e:
            logger.error(f"Generation failed: {str(e)}")
            yield {
                'stage': 'error',
                'message': f'Generation failed: {str(e)}',
                'progress': 0
            }
