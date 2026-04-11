import re

def detect_pii(text: str) -> bool:
    """
    Detects basic PII in the given text.
    Returns True if PII is detected, False otherwise.
    """
    # Basic email regex
    email_pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'
    if re.search(email_pattern, text):
        return True

    # Basic phone number regex (US format)
    phone_pattern = r'\b\d{3}[-.]?\d{3}[-.]?\d{4}\b'
    if re.search(phone_pattern, text):
        return True

    # Basic SSN regex
    ssn_pattern = r'\b\d{3}-\d{2}-\d{4}\b'
    if re.search(ssn_pattern, text):
        return True

    return False
