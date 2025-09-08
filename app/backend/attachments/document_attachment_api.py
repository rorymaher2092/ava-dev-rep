# attachments/document_attachment_api.py - FIXED blob path issue
import os
import json
import uuid
import hashlib
from typing import Dict, Any, List, Optional
from datetime import datetime
from quart import Blueprint, request, jsonify, current_app, session
from azure.storage.blob.aio import BlobServiceClient, ContainerClient
from azure.core.exceptions import ResourceNotFoundError
import tempfile
import PyPDF2
import pandas as pd
from pathlib import Path

# Import SAS storage and session helpers
from .sas_storage import sas_storage
from .attachment_helpers import (
    get_or_create_session_id,
    add_attachment_to_session,
    remove_attachment_from_session,
    get_attachment_counts,
    get_unified_session_attachments
)

document_bp = Blueprint("documents", __name__, url_prefix="/api/attachments/documents")

# File size and type limits
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25MB
ALLOWED_EXTENSIONS = {'.pdf', '.docx', '.xlsx', '.xls', '.pptx', '.csv', '.txt'}

# Key extraction function with full content support
async def extract_text_from_file_data(file_data: bytes, file_type: str, filename: str) -> str:
    """Extract text content from file data - FULL VERSION without truncation"""
    try:
        # Write to temp file for processing
        with tempfile.NamedTemporaryFile(suffix=file_type, delete=False) as tmp_file:
            tmp_file.write(file_data)
            tmp_file.flush()
            tmp_path = tmp_file.name
        
        try:
            extracted_text = ""
            
            if file_type == '.pdf':
                with open(tmp_path, 'rb') as pdf_file:
                    pdf_reader = PyPDF2.PdfReader(pdf_file)
                    num_pages = len(pdf_reader.pages)
                    current_app.logger.info(f"PDF has {num_pages} pages - extracting ALL pages")
                    
                    # Extract ALL pages, not just first 10
                    for page_num, page in enumerate(pdf_reader.pages):
                        try:
                            page_text = page.extract_text()
                            if page_text:
                                extracted_text += f"\n--- Page {page_num + 1} ---\n"
                                extracted_text += page_text + "\n"
                                
                                # Log progress every 10 pages for large documents
                                if (page_num + 1) % 10 == 0:
                                    current_app.logger.info(f"Extracted {page_num + 1}/{num_pages} pages...")
                            else:
                                current_app.logger.warning(f"No text extracted from page {page_num + 1}")
                        except Exception as e:
                            current_app.logger.error(f"Error extracting page {page_num + 1}: {e}")
                            extracted_text += f"\n--- Page {page_num + 1} ---\n[Error extracting page: {str(e)}]\n"
                    
                    # Check content size and apply smart truncation if needed
                    if len(extracted_text) > 500000:  # 500KB limit for text
                        current_app.logger.warning(f"PDF text is very large ({len(extracted_text)} chars), applying smart truncation")
                        # Smart truncation - keep beginning and end, note middle truncation
                        keep_chars = 200000  # Keep first and last 200K chars
                        truncated_middle = extracted_text[keep_chars:-keep_chars]
                        # Count what we're removing
                        removed_pages = truncated_middle.count("--- Page")
                        extracted_text = (
                            extracted_text[:keep_chars] + 
                            f"\n\n[... {removed_pages} middle pages truncated for size (original: {len(extracted_text)} chars) ...]\n\n" + 
                            extracted_text[-keep_chars:]
                        )
                    
                    # Final check
                    if not extracted_text or len(extracted_text.strip()) < 50:
                        current_app.logger.warning(f"PyPDF2 extracted minimal text ({len(extracted_text)} chars)")
                        extracted_text = "[PDF content could not be extracted - might be a scanned document or image-based PDF]"
                    else:
                        current_app.logger.info(f"Successfully extracted {len(extracted_text)} total characters from {num_pages} pages")
                        
            elif file_type in ['.xlsx', '.xls']:
                df = pd.read_excel(tmp_path, sheet_name=None)
                for sheet_name, sheet_df in df.items():
                    extracted_text += f"\n=== Sheet: {sheet_name} ===\n"
                    # Increase row limit for Excel files
                    if len(sheet_df) > 1000:
                        extracted_text += sheet_df.head(500).to_string() + "\n...\n"
                        extracted_text += sheet_df.tail(500).to_string() + "\n"
                        extracted_text += f"[{len(sheet_df) - 1000} middle rows omitted]\n"
                    else:
                        extracted_text += sheet_df.to_string() + "\n"
                current_app.logger.info(f"Extracted {len(extracted_text)} chars from Excel file")
                
            elif file_type == '.csv':
                df = pd.read_csv(tmp_path)
                # Increase row limit for CSV files
                if len(df) > 1000:
                    extracted_text = df.head(500).to_string() + "\n...\n"
                    extracted_text += df.tail(500).to_string() + "\n"
                    extracted_text += f"[{len(df) - 1000} middle rows omitted]\n"
                else:
                    extracted_text = df.to_string()
                current_app.logger.info(f"Extracted {len(extracted_text)} chars from CSV")
                
            elif file_type in ['.txt']:
                with open(tmp_path, 'r', encoding='utf-8', errors='ignore') as txt_file:
                    content = txt_file.read()
                    # Increase text file limit
                    if len(content) > 100000:
                        extracted_text = content[:50000] + f"\n[... {len(content) - 100000} chars omitted ...]\n" + content[-50000:]
                    else:
                        extracted_text = content
                current_app.logger.info(f"Extracted {len(extracted_text)} chars from text file")
                    
            elif file_type in ['.docx']:
                # Basic DOCX support using python-docx
                try:
                    from docx import Document
                    doc = Document(tmp_path)
                    for para in doc.paragraphs:
                        extracted_text += para.text + "\n"
                    
                    # Also extract from tables
                    for table in doc.tables:
                        for row in table.rows:
                            row_text = "\t".join([cell.text for cell in row.cells])
                            extracted_text += row_text + "\n"
                    
                    if not extracted_text:
                        extracted_text = "[DOCX file appears to be empty or could not be read]"
                    else:
                        current_app.logger.info(f"Extracted {len(extracted_text)} chars from DOCX")
                        
                except ImportError:
                    extracted_text = "[DOCX extraction requires python-docx library]"
                    current_app.logger.warning("python-docx not installed")
                except Exception as e:
                    extracted_text = f"[Error extracting DOCX: {str(e)}]"
                    current_app.logger.error(f"DOCX extraction error: {e}")
                    
            elif file_type == '.pptx':
                # Basic PPTX support using python-pptx
                try:
                    from pptx import Presentation
                    prs = Presentation(tmp_path)
                    for slide_num, slide in enumerate(prs.slides):
                        extracted_text += f"\n--- Slide {slide_num + 1} ---\n"
                        for shape in slide.shapes:
                            if hasattr(shape, "text"):
                                extracted_text += shape.text + "\n"
                    
                    if not extracted_text:
                        extracted_text = "[PPTX file appears to be empty or could not be read]"
                    else:
                        current_app.logger.info(f"Extracted {len(extracted_text)} chars from PPTX")
                        
                except ImportError:
                    extracted_text = "[PPTX extraction requires python-pptx library]"
                    current_app.logger.warning("python-pptx not installed")
                except Exception as e:
                    extracted_text = f"[Error extracting PPTX: {str(e)}]"
                    current_app.logger.error(f"PPTX extraction error: {e}")
            else:
                extracted_text = f"[File type {file_type} not supported for content extraction]"
                
            # Final validation
            if not extracted_text:
                extracted_text = f"[No content could be extracted from {file_type} file]"
                
            return extracted_text
            
        finally:
            # Clean up temp file
            try:
                os.unlink(tmp_path)
            except:
                pass
                
    except Exception as e:
        current_app.logger.error(f"Error in extract_text_from_file_data: {e}")
        import traceback
        current_app.logger.error(f"Traceback: {traceback.format_exc()}")
        return f"[Error processing document: {str(e)}]"

@document_bp.route("/upload", methods=["POST"])
async def upload_document():
    """Upload document using SAS-based ephemeral storage"""
    try:
        session_id = get_or_create_session_id()
        files = await request.files
        
        if 'file' not in files:
            return jsonify({"error": "No file provided"}), 400
            
        file = files['file']
        
        # Validate file
        filename = file.filename
        if not filename:
            return jsonify({"error": "Invalid filename"}), 400
            
        file_ext = Path(filename).suffix.lower()
        if file_ext not in ALLOWED_EXTENSIONS:
            return jsonify({"error": f"File type {file_ext} not allowed"}), 400
        
        # Read file data
        file_data = file.read()
        if len(file_data) > MAX_FILE_SIZE:
            return jsonify({"error": "File too large (max 25MB)"}), 400
        
        # Upload using SAS storage
        upload_result = await sas_storage.upload_attachment(
            session_id=session_id,
            file_data=file_data,
            filename=filename,
            file_type=file_ext,
            metadata={"content_extracted": "false"}
        )
        
        current_app.logger.info(f"Uploaded file to blob path: {upload_result['blob_path']}")
        
        # Create document info for session - ENSURE blob_path is stored correctly
        doc_info = {
            "id": upload_result["attachment_id"],
            "filename": filename,
            "blob_path": upload_result["blob_path"],  # This is the critical field
            "blob_url": upload_result["blob_url"],
            "file_type": file_ext,
            "size": len(file_data),
            "uploaded_at": upload_result["uploaded_at"],
            "added_at": datetime.utcnow().timestamp(),
        }
        
        # Add to session storage
        success = add_attachment_to_session("document", doc_info)
        
        if not success:
            # Clean up SAS blob if session storage failed
            await sas_storage.delete_attachment(upload_result["blob_path"])
            return jsonify({"error": f"Document {filename} already attached"}), 409
        
        current_app.logger.info(f"Successfully uploaded document: {filename} to session {session_id} at path {upload_result['blob_path']}")
        
        # Get updated counts
        counts = get_attachment_counts()
        
        return jsonify({
            "document": {
                "id": upload_result["attachment_id"],
                "filename": filename,
                "file_type": file_ext,
                "size": len(file_data),
                "uploaded_at": upload_result["uploaded_at"],
                "blob_url": upload_result["blob_url"],
                "blob_path": upload_result["blob_path"]  # Include in response for debugging
            },
            "session_id": session_id,
            "total_attachments": counts["total"]
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Document upload error: {e}")
        import traceback
        current_app.logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500

@document_bp.route("/<doc_id>", methods=["DELETE"])
async def remove_document(doc_id: str):
    """Remove a document attachment using SAS storage"""
    try:
        current_app.logger.info(f"=== REMOVE DOCUMENT START: {doc_id} ===")
        
        # Step 1: Get session ID
        try:
            session_id = get_or_create_session_id()
            current_app.logger.info(f"Session ID: {session_id}")
        except Exception as e:
            current_app.logger.error(f"Failed to get session ID: {e}")
            return jsonify({"error": "Session error"}), 500
        
        # Step 2: Get current attachments
        try:
            attachments = get_unified_session_attachments()
            documents = attachments.get("documents", [])
            current_app.logger.info(f"Found {len(documents)} documents in session")
        except Exception as e:
            current_app.logger.error(f"Failed to get session attachments: {e}")
            return jsonify({"error": "Failed to access session data"}), 500
        
        # Step 3: Find the document to remove
        doc_to_remove = None
        try:
            for doc in documents:
                current_app.logger.info(f"Checking document: {doc.get('id')} vs {doc_id}")
                if doc.get('id') == doc_id:
                    doc_to_remove = doc
                    break
        except Exception as e:
            current_app.logger.error(f"Error searching for document: {e}")
            return jsonify({"error": "Error searching documents"}), 500
                
        if not doc_to_remove:
            current_app.logger.error(f"Document {doc_id} not found in session")
            return jsonify({"error": "Document not found"}), 404
        
        current_app.logger.info(f"Found document to remove: {doc_to_remove.get('filename')}")
        
        # Step 4: Remove from session storage first
        try:
            success = remove_attachment_from_session("document", doc_id)
            current_app.logger.info(f"Session removal success: {success}")
            
            if not success:
                current_app.logger.error("Failed to remove from session storage")
                return jsonify({"error": "Failed to remove document from session"}), 500
        except Exception as e:
            current_app.logger.error(f"Error removing from session: {e}")
            return jsonify({"error": f"Session removal failed: {str(e)}"}), 500
            
        # Step 5: Delete from SAS storage if blob_path exists
        blob_path = doc_to_remove.get('blob_path')
        if blob_path:
            try:
                current_app.logger.info(f"Attempting to delete blob: {blob_path}")
                await sas_storage.delete_attachment(blob_path)
                current_app.logger.info(f"Successfully deleted blob: {blob_path}")
            except Exception as blob_error:
                current_app.logger.warning(f"Failed to delete blob {blob_path}: {blob_error}")
                # Don't fail the whole operation if blob deletion fails
        else:
            current_app.logger.warning("No blob_path found for document")
        
        # Step 6: Get updated counts
        try:
            counts = get_attachment_counts()
            current_app.logger.info(f"Updated attachment counts: {counts}")
        except Exception as e:
            current_app.logger.error(f"Error getting attachment counts: {e}")
            counts = {"total": 0}  # Fallback
        
        current_app.logger.info(f"=== REMOVE DOCUMENT SUCCESS: {doc_id} ===")
        
        return jsonify({
            "success": True,
            "session_id": session_id,
            "total_attachments": counts["total"]
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"=== REMOVE DOCUMENT FAILED: {doc_id} ===")
        current_app.logger.error(f"Document removal error: {e}")
        import traceback
        current_app.logger.error(f"Traceback: {traceback.format_exc()}")
        return jsonify({"error": f"Failed to remove document: {str(e)}"}), 500

@document_bp.route("/", methods=["GET"])
async def list_documents():
    """List all document attachments in session"""
    try:
        session_id = get_or_create_session_id()
        attachments = get_unified_session_attachments()
        documents = attachments.get("documents", [])
        
        # Return simplified list for UI
        doc_list = [{
            "id": doc['id'],
            "filename": doc['filename'],
            "file_type": doc['file_type'],
            "size": doc['size'],
            "uploaded_at": doc['uploaded_at']
        } for doc in documents]
        
        current_app.logger.info(f"Listed {len(doc_list)} documents for session {session_id}")
        
        return jsonify({
            "documents": doc_list,
            "count": len(doc_list),
            "session_id": session_id
        }), 200
        
    except Exception as e:
        current_app.logger.error(f"Document list error: {e}")
        return jsonify({"error": str(e)}), 500

# Helper function to get document content for chat context
async def get_document_content_for_chat(doc_info: Dict[str, Any]) -> str:
    """Retrieve and extract document content using SAS storage"""
    try:
        blob_path = doc_info.get('blob_path')
        if not blob_path:
            current_app.logger.error(f"No blob_path in doc_info: {doc_info}")
            return f"[Error: No blob path found for document {doc_info.get('filename', 'unknown')}]"
        
        current_app.logger.info(f"Attempting to get content from blob path: {blob_path}")
        
        # Get file data from SAS storage
        file_data = await sas_storage.get_attachment_content(blob_path)
        
        current_app.logger.info(f"Retrieved {len(file_data)} bytes from blob storage")
        
        # Extract text content
        extracted_text = await extract_text_from_file_data(
            file_data, 
            doc_info.get('file_type', '.txt'), 
            doc_info.get('filename', 'document')
        )
        
        return extracted_text
        
    except Exception as e:
        current_app.logger.error(f"Error getting document content for {doc_info.get('filename', 'unknown')}: {e}")
        import traceback
        current_app.logger.error(f"Traceback: {traceback.format_exc()}")
        return f"[Error accessing document {doc_info.get('filename', 'unknown')}: {str(e)}]"

def prepare_chat_with_attachments(should_consume: bool = False) -> Dict[str, Any]:
    """Prepare attachment data for chat context - lightweight version"""
    try:
        attachments = get_unified_session_attachments()
        
        jira_tickets = attachments.get("jira_tickets", [])
        confluence_pages = attachments.get("confluence_pages", [])
        documents = attachments.get("documents", [])
        
        current_app.logger.info(f"Preparing attachments: {len(jira_tickets)} Jira, {len(confluence_pages)} Confluence, {len(documents)} Documents")
        
        # Log document details for debugging
        for doc in documents:
            current_app.logger.info(f"Document in session: {doc.get('filename')} with blob_path: {doc.get('blob_path')}")
        
        # Build attachment sources for LLM context
        attachment_sources = []
        
        # Add Jira tickets
        for ticket in jira_tickets:
            source = f"""=== JIRA TICKET: {ticket.get('key', 'Unknown')} ===
Summary: {ticket.get('summary', 'No summary')}
Status: {ticket.get('status', 'Unknown')}
Priority: {ticket.get('priority', 'Unknown')}
Assignee: {ticket.get('assignee', 'Unassigned')}
Reporter: {ticket.get('reporter', 'Unknown')}
Type: {ticket.get('issue_type', 'Unknown')}
Created: {ticket.get('created', 'Unknown')}
Updated: {ticket.get('updated', 'Unknown')}
Description: {ticket.get('description', 'No description')}
URL: {ticket.get('url', '')}
"""
            attachment_sources.append(source)
        
        # Add Confluence pages
        for page in confluence_pages:
            source = f"""=== CONFLUENCE PAGE: {page.get('title', 'Unknown')} ===
Space: {page.get('space_name', page.get('space_key', 'Unknown'))}
Version: {page.get('version', 'Unknown')}
Last Modified: {page.get('last_modified', 'Unknown')}
URL: {page.get('url', '')}
Content:
{page.get('content', 'No content available')}
"""
            attachment_sources.append(source)
        
        # Return document info for async loading
        return {
            "has_attachments": len(jira_tickets) + len(confluence_pages) + len(documents) > 0,
            "attachment_count": len(jira_tickets) + len(confluence_pages) + len(documents),
            "attachment_sources": attachment_sources,  # Jira and Confluence only
            "document_sources_pending": documents,  # Documents to be loaded async
            "attachment_types": {
                "jira": len(jira_tickets),
                "confluence": len(confluence_pages),
                "documents": len(documents)
            }
        }
        
    except Exception as e:
        current_app.logger.error(f"Error in prepare_chat_with_attachments: {e}")
        return {
            "has_attachments": False,
            "attachment_count": 0,
            "attachment_sources": [],
            "document_sources_pending": [],
            "attachment_types": {"jira": 0, "confluence": 0, "documents": 0}
        }

async def load_and_finalize_attachments(attachment_prep: Dict[str, Any]) -> Dict[str, Any]:
    """Load document content and finalize all attachments"""
    attachment_sources = attachment_prep["attachment_sources"].copy()
    
    # Load document content
    for doc in attachment_prep["document_sources_pending"]:
        try:
            current_app.logger.info(f"Loading content for document: {doc.get('filename')} from path: {doc.get('blob_path')}")
            content = await get_document_content_for_chat(doc)
            source = f"""=== DOCUMENT: {doc.get('filename', 'Unknown')} ===
File Type: {doc.get('file_type', 'Unknown')}
Size: {doc.get('size', 0)} bytes
Uploaded: {doc.get('uploaded_at', 'Unknown')}
Content:
{content}
"""
            attachment_sources.append(source)
            current_app.logger.info(f"Successfully loaded content for document: {doc.get('filename')}")
        except Exception as e:
            current_app.logger.error(f"Failed to load document {doc.get('filename')}: {e}")
            attachment_sources.append(f"=== DOCUMENT: {doc.get('filename')} ===\nContent: [Error loading: {str(e)}]")
    
    return {
        "has_attachments": attachment_prep["has_attachments"],
        "attachment_count": attachment_prep["attachment_count"],
        "attachment_sources": attachment_sources,
        "attachment_types": attachment_prep["attachment_types"]
    }