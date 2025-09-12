# direct_attachment_api.py - API endpoints for direct attachment storage
from quart import Blueprint, request, jsonify, current_app
from attachments.direct_attachment_storage import attachment_storage
from attachments.attachment_helpers import validate_jira_ticket, validate_confluence_page, validate_document
from decorators import authenticated
from typing import Any, Dict

direct_attachment_bp = Blueprint('direct_attachments', __name__)

@direct_attachment_bp.route('/api/attachments/store', methods=['POST'])
@authenticated
async def store_attachment(auth_claims: Dict[str, Any]):
    """Store a single attachment and return UUID"""
    try:
        data = await request.get_json()
        attachment_type = data.get('type')
        
        if not attachment_type:
            return jsonify({'error': 'Attachment type required'}), 400
        
        # Validate based on type
        if attachment_type == 'jira':
            ticket_key = data.get('key')
            if not ticket_key:
                return jsonify({'error': 'JIRA ticket key required'}), 400
            
            validation = await validate_jira_ticket(ticket_key)
            if not validation.get('valid'):
                return jsonify({'error': f"JIRA validation failed: {validation.get('error')}"}), 400
            
            attachment_data = {
                'type': 'jira',
                'key': ticket_key,
                'summary': validation.get('summary'),
                'status': validation.get('status'),
                'url': validation.get('url')
            }
            
        elif attachment_type == 'confluence':
            page_url = data.get('url')
            if not page_url:
                return jsonify({'error': 'Confluence page URL required'}), 400
            
            validation = await validate_confluence_page(page_url)
            if not validation.get('valid'):
                return jsonify({'error': f"Confluence validation failed: {validation.get('error')}"}), 400
            
            attachment_data = {
                'type': 'confluence',
                'url': page_url,
                'title': validation.get('title'),
                'space': validation.get('space_name')
            }
            
        elif attachment_type == 'document':
            doc_id = data.get('id')
            blob_path = data.get('blob_path')
            filename = data.get('filename')
            
            if not all([doc_id, blob_path, filename]):
                return jsonify({'error': 'Document ID, blob_path, and filename required'}), 400
            
            validation = await validate_document(doc_id, blob_path)
            if not validation.get('valid'):
                return jsonify({'error': f"Document validation failed: {validation.get('error')}"}), 400
            
            attachment_data = {
                'type': 'document',
                'id': doc_id,
                'blob_path': blob_path,
                'filename': filename,
                'fileType': data.get('fileType', '.txt'),
                'size': data.get('size', 0),
                'uploaded_at': data.get('uploaded_at')
            }
            
        else:
            return jsonify({'error': f'Unknown attachment type: {attachment_type}'}), 400
        
        # Store attachment
        attachment_id = await attachment_storage.store_attachment(attachment_data, ttl_minutes=30)
        
        current_app.logger.info(f"Stored {attachment_type} attachment: {attachment_id}")
        
        return jsonify({
            'attachment_id': attachment_id,
            'type': attachment_type,
            'expires_in_minutes': 30
        })
        
    except Exception as e:
        current_app.logger.error(f"Error storing attachment: {str(e)}")
        return jsonify({'error': 'Failed to store attachment'}), 500

@direct_attachment_bp.route('/api/attachments/list', methods=['POST'])
@authenticated
async def list_attachments(auth_claims: Dict[str, Any]):
    """Get attachment info by IDs (without consuming them)"""
    try:
        data = await request.get_json()
        attachment_ids = data.get('attachment_ids', [])
        
        if not attachment_ids:
            return jsonify({'attachments': []})
        
        attachments = []
        for attachment_id in attachment_ids:
            attachment_data = await attachment_storage.get_attachment(attachment_id)
            if attachment_data:
                # Return summary info only
                summary = {
                    'attachment_id': attachment_id,
                    'type': attachment_data.get('type'),
                    'expires_at': attachment_data.get('expires_at')
                }
                
                if attachment_data.get('type') == 'jira':
                    summary['key'] = attachment_data.get('key')
                    summary['summary'] = attachment_data.get('summary')
                elif attachment_data.get('type') == 'confluence':
                    summary['title'] = attachment_data.get('title')
                    summary['url'] = attachment_data.get('url')
                elif attachment_data.get('type') == 'document':
                    summary['filename'] = attachment_data.get('filename')
                    summary['size'] = attachment_data.get('size')
                
                attachments.append(summary)
        
        return jsonify({'attachments': attachments})
        
    except Exception as e:
        current_app.logger.error(f"Error listing attachments: {str(e)}")
        return jsonify({'error': 'Failed to list attachments'}), 500

@direct_attachment_bp.route('/api/attachments/delete', methods=['POST'])
@authenticated
async def delete_attachment_endpoint(auth_claims: Dict[str, Any]):
    """Delete a specific attachment"""
    try:
        data = await request.get_json()
        attachment_id = data.get('attachment_id')
        
        if not attachment_id:
            return jsonify({'error': 'Attachment ID required'}), 400
        
        success = await attachment_storage.delete_attachment(attachment_id)
        
        return jsonify({'success': success})
        
    except Exception as e:
        current_app.logger.error(f"Error deleting attachment: {str(e)}")
        return jsonify({'error': 'Failed to delete attachment'}), 500