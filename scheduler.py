#!/usr/bin/env python3
"""
Bulletin Scheduler - APScheduler integration for automatic bulletin generation.
"""

import logging
import re
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)


class BulletinScheduler:
    """Wraps APScheduler for scheduled bulletin generation."""

    def __init__(self):
        self.scheduler = BackgroundScheduler()
        self.app = None

    def init_app(self, flask_app):
        """
        Initialise scheduler with Flask app context.
        Loads schedules from config and starts the scheduler.
        """
        self.app = flask_app

        # Load existing schedules from config
        with flask_app.app_context():
            from app import load_config
            config = load_config()

            for profile_id, profile in config.get('profiles', {}).items():
                schedule = profile.get('schedule', {})
                if schedule.get('enabled') and schedule.get('time'):
                    self.add_schedule(
                        profile_id,
                        schedule['time'],
                        schedule.get('timezone', 'Australia/Sydney')
                    )

        self.scheduler.start()
        logger.info("Bulletin scheduler started")

    def add_schedule(self, profile_id, time_str, timezone='Australia/Sydney'):
        """
        Add or update a schedule for a profile.

        Args:
            profile_id: Profile identifier
            time_str: Time in HH:MM format
            timezone: Timezone string (e.g., 'Australia/Sydney')
        """
        job_id = f"bulletin_{profile_id}"

        # Remove existing job if any
        self.remove_schedule(profile_id)

        if not re.match(r'^\d{2}:\d{2}$', time_str):
            logger.error(f"Invalid time format for {profile_id}: {time_str} (expected HH:MM)")
            return

        try:
            hour, minute = time_str.split(':')
            trigger = CronTrigger(
                hour=int(hour),
                minute=int(minute),
                timezone=timezone
            )

            self.scheduler.add_job(
                self._generate_bulletin,
                trigger=trigger,
                id=job_id,
                args=[profile_id],
                replace_existing=True,
                name=f"Generate bulletin for {profile_id}"
            )

            logger.info(f"Scheduled bulletin for {profile_id} at {time_str} ({timezone})")
        except Exception as e:
            logger.error(f"Failed to add schedule for {profile_id}: {str(e)}")

    def remove_schedule(self, profile_id):
        """Remove a scheduled job for a profile."""
        job_id = f"bulletin_{profile_id}"
        try:
            if self.scheduler.get_job(job_id):
                self.scheduler.remove_job(job_id)
                logger.info(f"Removed schedule for {profile_id}")
        except Exception as e:
            logger.error(f"Failed to remove schedule for {profile_id}: {str(e)}")

    def _generate_bulletin(self, profile_id):
        """Generate a bulletin within Flask app context."""
        if not self.app:
            logger.error("No Flask app configured for scheduler")
            return

        with self.app.app_context():
            try:
                from app import load_config, get_enabled_sources_ordered
                from enhanced_generator import EnhancedBulletinGenerator

                config = load_config()

                if profile_id not in config['profiles']:
                    logger.error(f"Profile {profile_id} not found for scheduled generation")
                    return

                profile_data = config['profiles'][profile_id]
                enabled_sources = get_enabled_sources_ordered(profile_data)

                if not enabled_sources:
                    logger.warning(f"No enabled sources for scheduled profile {profile_id}")
                    return

                generator = EnhancedBulletinGenerator(output_dir='output')

                logger.info(f"Scheduled generation starting for {profile_id}")
                for event in generator.generate_with_progress(enabled_sources, profile_id):
                    if event.get('stage') == 'complete':
                        logger.info(f"Scheduled bulletin complete: {event.get('filename')}")
                    elif event.get('stage') == 'error':
                        logger.error(f"Scheduled generation error: {event.get('message')}")

            except Exception as e:
                logger.error(f"Scheduled generation failed for {profile_id}: {str(e)}")

    def get_schedules(self):
        """Return list of active jobs with next run times."""
        schedules = []
        for job in self.scheduler.get_jobs():
            schedules.append({
                'id': job.id,
                'name': job.name,
                'next_run': job.next_run_time.isoformat() if job.next_run_time else None,
                'profile_id': job.id.replace('bulletin_', '')
            })
        return schedules

    def shutdown(self):
        """Shut down the scheduler gracefully."""
        if self.scheduler.running:
            self.scheduler.shutdown(wait=False)
            logger.info("Bulletin scheduler shut down")
