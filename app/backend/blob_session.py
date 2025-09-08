# blob_session.py - Fixed production-ready solution
import json
import pickle
import uuid
import time
import hashlib
import os
from typing import Any, Dict, Optional
from datetime import datetime, timedelta
import asyncio
from azure.storage.blob.aio import BlobServiceClient, BlobClient
from azure.core.exceptions import ResourceNotFoundError
from quart import current_app
import logging

logger = logging.getLogger(__name__)

class BlobSessionInterface:
    """Production-ready session interface for Quart using Azure Blob Storage"""
    
    def __init__(self, connection_string: str = None, container_name: str = "sessions"):
        self.container_name = container_name
        self._initialized = False
        self._cleanup_task = None  # Initialize this attribute
        
        # Priority 1: Use managed identity (preferred for Azure Container Apps)
        account_name = os.environ.get('AZURE_STORAGE_ACCOUNT')
        # Also check current_app config if available
        try:
            from quart import current_app
            if hasattr(current_app, 'config'):
                account_name = account_name or current_app.config.get('AZURE_STORAGE_ACCOUNT')
        except:
            pass  # No current_app context available
            
        if account_name and not connection_string:
            from azure.identity.aio import ManagedIdentityCredential
            try:
                # Use system-assigned managed identity
                credential = ManagedIdentityCredential()
                self.blob_service_client = BlobServiceClient(
                    account_url=f"https://{account_name}.blob.core.windows.net",
                    credential=credential
                )
                logger.info(f"Using managed identity for blob storage: {account_name}")
                return
            except Exception as e:
                logger.error(f"Failed to initialize with managed identity: {e}")
                # Fall through to other methods
        
        # Priority 2: Use connection string if provided
        if connection_string:
            try:
                self.blob_service_client = BlobServiceClient.from_connection_string(connection_string)
                logger.info("Using connection string for blob storage")
                return
            except Exception as e:
                logger.error(f"Failed to initialize blob service client with connection string: {e}")
                raise
        
        # Priority 3: Use account key if available
        if account_name:
            account_key = os.environ.get('AZURE_STORAGE_KEY')
            if account_key:
                connection_string = f"DefaultEndpointsProtocol=https;AccountName={account_name};AccountKey={account_key};EndpointSuffix=core.windows.net"
                try:
                    self.blob_service_client = BlobServiceClient.from_connection_string(connection_string)
                    logger.info("Using account key for blob storage")
                    return
                except Exception as e:
                    logger.error(f"Failed to initialize with account key: {e}")
                    raise
        
        raise ValueError("No valid Azure Storage configuration found. Need AZURE_STORAGE_ACCOUNT with managed identity, or connection string, or account key")
        
    async def initialize(self):
        """Initialize the container and cleanup task"""
        if self._initialized:
            return
            
        try:
            container_client = self.blob_service_client.get_container_client(self.container_name)
            
            # Check if container exists, create if it doesn't
            try:
                await container_client.get_container_properties()
                logger.info(f"Session container '{self.container_name}' already exists")
            except ResourceNotFoundError:
                await container_client.create_container()
                logger.info(f"Created session container: {self.container_name}")
                
        except Exception as e:
            logger.error(f"Error initializing container '{self.container_name}': {e}")
            # Don't raise here - we can still try to work with the container
        
        self._initialized = True
        
    async def start_cleanup_task(self):
        """Start background task to clean up expired sessions"""
        # This attribute should now exist due to __init__ fix
        if self._cleanup_task:
            return
            
        async def cleanup_loop():
            while True:
                try:
                    await asyncio.sleep(3600)  # Run every hour
                    await self.cleanup_expired_sessions()
                except asyncio.CancelledError:
                    logger.info("Session cleanup task cancelled")
                    break
                except Exception as e:
                    logger.error(f"Session cleanup error: {e}")
        
        self._cleanup_task = asyncio.create_task(cleanup_loop())
        logger.info("Started session cleanup task")
        
    async def stop_cleanup_task(self):
        """Stop the cleanup task"""
        if self._cleanup_task:
            self._cleanup_task.cancel()
            try:
                await self._cleanup_task
            except asyncio.CancelledError:
                pass
            self._cleanup_task = None
            logger.info("Stopped session cleanup task")
        
    async def get(self, session_id: str) -> Dict[str, Any]:
        """Get session data from blob storage"""
        if not session_id:
            return {}
            
        try:
            container_client = self.blob_service_client.get_container_client(self.container_name)
            blob_client = container_client.get_blob_client(f"{session_id}.session")
            
            download = await blob_client.download_blob()
            data = await download.readall()
            
            # Update last accessed time
            try:
                await blob_client.set_blob_metadata(metadata={"last_accessed": str(time.time())})
            except Exception:
                pass  # Don't fail if we can't update metadata
            
            return pickle.loads(data)
            
        except ResourceNotFoundError:
            logger.debug(f"Session {session_id} not found")
            return {}
        except Exception as e:
            logger.error(f"Error loading session {session_id}: {e}")
            return {}
    
    async def set(self, session_id: str, data: Dict[str, Any], expiry: int = 86400) -> bool:
        """Save session data to blob storage"""
        if not session_id:
            return False
            
        try:
            container_client = self.blob_service_client.get_container_client(self.container_name)
            blob_client = container_client.get_blob_client(f"{session_id}.session")
            
            # Serialize with pickle for efficiency
            serialized = pickle.dumps(data)
            
            # Upload with metadata
            await blob_client.upload_blob(
                serialized,
                overwrite=True,
                metadata={
                    "last_accessed": str(time.time()),
                    "expiry": str(expiry),
                    "created": str(datetime.utcnow().isoformat())
                }
            )
            
            return True
            
        except Exception as e:
            logger.error(f"Error saving session {session_id}: {e}")
            return False
    
    async def delete(self, session_id: str) -> bool:
        """Delete a session from blob storage"""
        if not session_id:
            return False
            
        try:
            container_client = self.blob_service_client.get_container_client(self.container_name)
            blob_client = container_client.get_blob_client(f"{session_id}.session")
            await blob_client.delete_blob()
            logger.debug(f"Deleted session: {session_id}")
            return True
        except Exception as e:
            logger.debug(f"Could not delete session {session_id}: {e}")
            return False
    
    async def cleanup_expired_sessions(self, max_age_seconds: int = 86400):
        """Remove sessions older than max_age_seconds"""
        try:
            container_client = self.blob_service_client.get_container_client(self.container_name)
            cutoff_time = time.time() - max_age_seconds
            cleaned_count = 0
            
            async for blob in container_client.list_blobs(include=['metadata']):
                if blob.name.endswith('.session'):
                    try:
                        last_accessed = float(blob.metadata.get('last_accessed', 0)) if blob.metadata else 0
                        if last_accessed < cutoff_time:
                            await container_client.delete_blob(blob.name)
                            cleaned_count += 1
                    except Exception:
                        pass  # Skip problematic blobs
                        
            if cleaned_count > 0:
                logger.info(f"Cleaned up {cleaned_count} expired sessions")
                            
        except Exception as e:
            logger.error(f"Session cleanup error: {e}")

    async def close(self):
        """Close the blob service client and cleanup task"""
        await self.stop_cleanup_task()
        if hasattr(self, 'blob_service_client'):
            await self.blob_service_client.close()
            logger.info("Closed blob service client")

class QuartBlobSession:
    """Integrate Blob Storage sessions with Quart"""
    
    def __init__(self, app=None):
        self.app = app
        self.interface = None
        if app:
            self.init_app(app)
    
    def init_app(self, app):
        """Initialize the extension with the Quart app"""
        self.app = app
        
        # Set default configuration
        app.config.setdefault('SESSION_COOKIE_NAME', 'session_id')
        app.config.setdefault('SESSION_COOKIE_HTTPONLY', True)
        app.config.setdefault('SESSION_COOKIE_SECURE', True)
        app.config.setdefault('SESSION_COOKIE_SAMESITE', 'Lax')
        app.config.setdefault('SESSION_PERMANENT', True)
        app.config.setdefault('PERMANENT_SESSION_LIFETIME', 86400)
        
        # Initialize blob interface
        connection_string = app.config.get('AZURE_STORAGE_CONNECTION_STRING')
        container_name = app.config.get('SESSION_CONTAINER_NAME', 'sessions')
        
        self.interface = BlobSessionInterface(connection_string, container_name)
        
        # Register initialization
        @app.before_serving
        async def initialize_sessions():
            try:
                await self.interface.initialize()
                await self.interface.start_cleanup_task()
                app.logger.info("Blob session storage initialized successfully")
            except Exception as e:
                app.logger.error(f"Failed to initialize blob session storage: {e}")
                # Continue without sessions rather than crashing
        
        # Register cleanup
        @app.after_serving
        async def cleanup_sessions():
            try:
                await self.interface.close()
                app.logger.info("Blob session storage cleaned up")
            except Exception as e:
                app.logger.error(f"Error cleaning up blob session storage: {e}")
        
        # Register middleware
        @app.before_request
        async def load_session():
            from quart import session, request
            
            # Get session ID from cookie
            session_id = request.cookies.get(app.config['SESSION_COOKIE_NAME'])
            
            if not session_id:
                # Generate new session ID
                session_id = str(uuid.uuid4())
                session._is_new = True
            else:
                session._is_new = False
            
            session._id = session_id
            
            # Load session data from blob storage
            try:
                data = await self.interface.get(session_id)
                # Update session with loaded data
                session.update(data)
            except Exception as e:
                app.logger.error(f"Error loading session {session_id}: {e}")
                # Continue with empty session
                
            session.modified = False
        
        @app.after_request
        async def save_session(response):
            from quart import session
            
            if not hasattr(session, '_id'):
                return response
            
            # Only save if session was modified or is new
            if session.modified or getattr(session, '_is_new', False):
                try:
                    # Extract session data
                    data = dict(session)
                    data.pop('_id', None)
                    data.pop('_is_new', None)
                    
                    # Save to blob storage
                    success = await self.interface.set(
                        session._id,
                        data,
                        app.config['PERMANENT_SESSION_LIFETIME']
                    )
                    
                    if not success:
                        app.logger.warning(f"Failed to save session {session._id}")
                    
                    # Set cookie if new session
                    if getattr(session, '_is_new', False):
                        response.set_cookie(
                            app.config['SESSION_COOKIE_NAME'],
                            session._id,
                            max_age=app.config['PERMANENT_SESSION_LIFETIME'],
                            httponly=app.config['SESSION_COOKIE_HTTPONLY'],
                            secure=app.config['SESSION_COOKIE_SECURE'],
                            samesite=app.config['SESSION_COOKIE_SAMESITE']
                        )
                        
                except Exception as e:
                    app.logger.error(f"Error saving session {session._id}: {e}")
            
            return response