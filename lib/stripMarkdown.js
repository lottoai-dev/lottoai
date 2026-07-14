/** AI sohbet cevaplarından markdown işaretlerini temizler. */
function stripMarkdown(text) {
  let result = text;
  for (let i = 0; i < 3; i++) {
    result = result.replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1');
  }
  result = result.replace(/\*\*/g, '');
  result = result.replace(/__/g, '');
  result = result.replace(/\*([^*\n]+)\*/g, '$1');
  result = result.replace(/_([^_\n]+)_/g, '$1');
  result = result.replace(/^#{1,6}\s+/gm, '');
  result = result.replace(/^\s*[-*+•]\s+/gm, '');
  result = result.replace(/^\s*\d+\.\s+/gm, '');
  result = result.replace(/`([^`]+)`/g, '$1');
  return result;
}

module.exports = { stripMarkdown };
