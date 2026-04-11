import logging
import json

logger = logging.getLogger("security")

def log_event(event: dict):
    logger.info(json.dumps(event))