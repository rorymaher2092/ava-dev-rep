# healthz.py - Fast health check endpoint
from quart import Blueprint, jsonify

healthz_bp = Blueprint('healthz', __name__)

@healthz_bp.route('/healthz')
async def health_check():
    """Fast health check that bypasses sessions and external dependencies"""
    return jsonify({"status": "healthy"}), 200

@healthz_bp.route('/readiness')
async def readiness_check():
    """Readiness check that bypasses sessions"""
    return jsonify({"status": "ready"}), 200