"""
Creates the logger for the Django apps
"""
import logging


logging.basicConfig(
    format='%(levelname)s [%(name)s.%(funcName)s]: %(message)s',
    level=logging.INFO,
)
