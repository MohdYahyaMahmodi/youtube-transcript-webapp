"""
YouTube Transcript Extractor
A Flask web application for extracting and displaying YouTube video transcripts
with timestamp support and text editing capabilities.
"""

from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from youtube_transcript_api import YouTubeTranscriptApi
import re
import logging

# Initialize Flask app
app = Flask(__name__)
CORS(app)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def extract_video_id(url):
    """
    Extract YouTube video ID from various URL formats.
    
    Args:
        url (str): YouTube video URL
        
    Returns:
        str: Video ID if found, None otherwise
    """
    patterns = [
        r'(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)',
        r'youtube\.com\/watch\?.*v=([^&\n?#]+)',
        r'youtube\.com\/shorts\/([^&\n?#]+)'
    ]
    
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    return None

def format_timestamp(seconds):
    """
    Convert seconds to readable timestamp format (MM:SS or HH:MM:SS).
    
    Args:
        seconds (float): Time in seconds
        
    Returns:
        str: Formatted timestamp
    """
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    
    if hours > 0:
        return f"{hours}:{minutes:02d}:{secs:02d}"
    return f"{minutes}:{secs:02d}"

def chunk_transcript(transcript_list):
    """
    Group transcript entries into logical chunks for better readability.
    
    Chunks are created based on:
    - 30-second time intervals
    - Sentence endings (., !, ?)
    - Natural pauses (2+ second gaps between entries)
    
    Args:
        transcript_list (list): Raw transcript data from YouTube API
        
    Returns:
        list: Grouped transcript chunks
    """
    chunks = []
    current_chunk = []
    current_chunk_duration = 0
    
    for i, entry in enumerate(transcript_list):
        current_chunk.append(entry)
        current_chunk_duration += entry['duration']
        
        # Determine if we should break the current chunk
        should_break = (
            current_chunk_duration >= 30 or  # 30 second chunks
            entry['text'].strip().endswith(('.', '!', '?')) or  # Sentence ends
            (i < len(transcript_list) - 1 and 
             transcript_list[i + 1]['start'] - (entry['start'] + entry['duration']) > 2)  # 2+ second gap
        )
        
        # Create chunk if conditions are met and we have minimum entries
        if should_break and len(current_chunk) >= 3:
            chunks.append(current_chunk)
            current_chunk = []
            current_chunk_duration = 0
    
    # Add any remaining entries as final chunk
    if current_chunk:
        chunks.append(current_chunk)
    
    return chunks

@app.route('/')
def index():
    """Serve the main application page."""
    return render_template('index.html')

@app.route('/api/transcript', methods=['POST'])
def get_transcript():
    """
    API endpoint to fetch and process YouTube video transcripts.
    
    Expected JSON payload:
        {
            "url": "https://youtube.com/watch?v=VIDEO_ID"
        }
    
    Returns:
        JSON response with processed transcript data
    """
    try:
        data = request.get_json()
        
        if not data or 'url' not in data:
            return jsonify({'error': 'URL is required'}), 400
            
        url = data.get('url', '').strip()
        
        if not url:
            return jsonify({'error': 'URL cannot be empty'}), 400
        
        # Extract video ID from URL
        video_id = extract_video_id(url)
        if not video_id:
            return jsonify({'error': 'Invalid YouTube URL format'}), 400
        
        logger.info(f"Fetching transcript for video ID: {video_id}")
        
        # Fetch transcript from YouTube
        transcript_list = YouTubeTranscriptApi.get_transcript(video_id)
        
        if not transcript_list:
            return jsonify({'error': 'No transcript available for this video'}), 404
        
        # Process individual entries with timestamps
        formatted_entries = []
        for entry in transcript_list:
            formatted_entries.append({
                'text': entry['text'].strip(),
                'start': entry['start'],
                'duration': entry['duration'],
                'timestamp': format_timestamp(entry['start'])
            })
        
        # Create logical chunks for better structure
        chunks = chunk_transcript(transcript_list)
        
        # Format chunks with metadata
        formatted_chunks = []
        for chunk in chunks:
            chunk_entries = []
            for entry in chunk:
                chunk_entries.append({
                    'text': entry['text'].strip(),
                    'start': entry['start'],
                    'duration': entry['duration'],
                    'timestamp': format_timestamp(entry['start'])
                })
            
            formatted_chunks.append({
                'entries': chunk_entries,
                'startTime': format_timestamp(chunk[0]['start']),
                'text': ' '.join([entry['text'].strip() for entry in chunk])
            })
        
        # Create plain text versions
        plain_chunks = [chunk['text'] for chunk in formatted_chunks]
        full_text = ' '.join(plain_chunks)
        
        logger.info(f"Successfully processed transcript: {len(formatted_chunks)} chunks, {len(full_text.split())} words")
        
        return jsonify({
            'videoId': video_id,
            'withTimestamps': formatted_entries,
            'chunks': formatted_chunks,
            'plainChunks': plain_chunks,
            'withoutTimestamps': full_text,
            'stats': {
                'totalChunks': len(formatted_chunks),
                'totalWords': len(full_text.split()),
                'duration': formatted_entries[-1]['start'] if formatted_entries else 0
            }
        })
        
    except Exception as e:
        error_msg = str(e)
        logger.error(f"Error fetching transcript: {error_msg}")
        
        # Provide user-friendly error messages
        if 'No transcripts were found' in error_msg:
            return jsonify({'error': 'No captions available for this video'}), 404
        elif 'unavailable' in error_msg.lower():
            return jsonify({'error': 'Video is unavailable or private'}), 404
        else:
            return jsonify({'error': 'Could not fetch transcript. Please try again.'}), 500

@app.errorhandler(404)
def not_found(error):
    """Handle 404 errors."""
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(500)
def internal_error(error):
    """Handle 500 errors."""
    logger.error(f"Internal server error: {error}")
    return jsonify({'error': 'Internal server error'}), 500

if __name__ == '__main__':
    # Run the application
    app.run(host='0.0.0.0', port=5000, debug=True)