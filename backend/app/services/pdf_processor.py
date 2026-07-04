import fitz  # PyMuPDF
from typing import List, Dict, Any

class PDFProcessor:
    @staticmethod
    def extract_text_and_chunks(file_bytes: bytes, chunk_size: int = 800, chunk_overlap: int = 150) -> List[Dict[str, Any]]:
        """
        Extracts text from a PDF in bytes and splits it into logical, overlapping chunks.
        
        Args:
            file_bytes: The raw PDF file bytes.
            chunk_size: Maximum character count per chunk.
            chunk_overlap: Overlap in characters between adjacent chunks.
            
        Returns:
            A list of dictionaries, where each dict has keys:
              - 'page_number': 1-indexed page number
              - 'content': raw text snippet
              - 'chunk_index': sequence index of the chunk in the document
        """
        # Open PDF document from memory bytes
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        chunks = []
        
        for page_idx in range(len(doc)):
            page = doc[page_idx]
            page_num = page_idx + 1
            text = page.get_text("text")
            
            # Clean up excessive whitespace and handle empty pages
            clean_text = " ".join(text.split())
            if not clean_text:
                continue
            
            # Split the text on the page
            page_chunks = PDFProcessor.split_text(clean_text, chunk_size, chunk_overlap)
            
            for chunk_text in page_chunks:
                chunks.append({
                    "page_number": page_num,
                    "content": chunk_text,
                    "chunk_index": len(chunks)
                })
                
        doc.close()
        return chunks

    @staticmethod
    def split_text(text: str, chunk_size: int, chunk_overlap: int) -> List[str]:
        """
        Splits a single block of text into chunks, attempting to align splitting 
        points on sentence boundaries or spaces to maintain semantic coherence.
        """
        if len(text) <= chunk_size:
            return [text]
            
        chunks = []
        start = 0
        while start < len(text):
            end = start + chunk_size
            
            # If we are not at the end of the text, try to align splitting on a punctuation or space
            if end < len(text):
                # Search backwards in the last 40% of the chunk window for standard sentence terminators
                boundary = -1
                search_start = start + int(chunk_size * 0.6)
                
                # Check for sentence endings first
                for punctuation in [". ", "? ", "! "]:
                    pos = text.rfind(punctuation, search_start, end)
                    if pos != -1:
                        boundary = pos + len(punctuation)
                        break
                
                # Fallback to spaces if no sentence boundary is found
                if boundary == -1:
                    pos = text.rfind(" ", search_start, end)
                    if pos != -1:
                        boundary = pos + 1
                
                # Apply boundary if found
                if boundary != -1:
                    end = boundary
            
            chunk = text[start:end].strip()
            if chunk:
                chunks.append(chunk)
            
            # Slide window back by overlap
            next_start = end - chunk_overlap
            
            # Prevent infinite loops (e.g. if start doesn't progress)
            if next_start <= start:
                start = end
            else:
                start = next_start
                
        return chunks
