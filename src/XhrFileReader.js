/**
 * @flow
 */
'use strict';

const ChunkedFileData = require('./ChunkedFileData');
const MediaFileReader = require('./MediaFileReader');

const CHUNK_SIZE = 1024;

import type {
  LoadCallbackType,
  CallbackType
} from './FlowTypes';

class XhrFileReader extends MediaFileReader {
  _url: string;
  // $FlowIssue - Flow gets confused with module.exports
  _fileData: ChunkedFileData;

  constructor(url: string) {
    super();
    this._url = url;
    // $FlowIssue - Constructor cannot be called on exports
    this._fileData = new ChunkedFileData();
  }

  static canReadFile(file: any): boolean {
    return (
      typeof file === 'string' &&
      /^[a-z]+:\/\//i.test(file)
    );
  }

  _init(callbacks: LoadCallbackType): void {
    var self = this;

    this._makeXHRRequest("HEAD", null, {
      onSuccess: function(xhr: XMLHttpRequest) {
        self._size = parseInt(xhr.getResponseHeader("Content-Length"), 10);
        callbacks.onSuccess();
      },
      onError: callbacks.onError
    })
  }

  loadRange(range: [number, number], callbacks: LoadCallbackType): void {
    var self = this;

    if (self._fileData.hasDataRange(range[0], range[1])) {
      setTimeout(callbacks.onSuccess, 1);
      return;
    }

    // Always download in multiples of CHUNK_SIZE. If we're going to make a
    // request might as well get a chunk that makes sense. The big cost is
    // establishing the connection so getting 10bytes or 1K doesn't really
    // make a difference.
    range = this._roundRangeToChunkMultiple(range);

    this._makeXHRRequest("GET", range, {
      onSuccess: function(xhr: XMLHttpRequest) {
        var data = xhr.responseBody || xhr.responseText;
        self._fileData.addData(range[0], data);
        callbacks.onSuccess();
      },
      onError: callbacks.onError
    });
  }

  _roundRangeToChunkMultiple(range: [number, number]): [number, number] {
    var length = range[1] - range[0] + 1;
    var newLength = Math.ceil(length/CHUNK_SIZE) * CHUNK_SIZE;
    return [range[0], range[0] + newLength - 1];
  }

  _makeXHRRequest(
    method: string,
    range: ?[number, number],
    callbacks: CallbackType
  ) {
    var xhr = this._createXHRObject();

    var onXHRLoad = function() {
      // 200 - OK
      // 206 - Partial Content
      if (xhr.status === 200 || xhr.status === 206) {
        callbacks.onSuccess(xhr);
      } else if (callbacks.onError) {
        callbacks.onError({"type": "xhr", "xhr": xhr});
      }
      xhr = null;
    };

    if (typeof xhr.onload !== 'undefined') {
      xhr.onload = onXHRLoad;
      xhr.onerror = function() {
        if (callbacks.onError) {
          callbacks.onError({"type": "xhr", "xhr": xhr});
        }
      }
    } else {
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
          onXHRLoad();
        }
      };
    }

    xhr.open(method, this._url);
    xhr.overrideMimeType("text/plain; charset=x-user-defined");
    if (range) {
      xhr.setRequestHeader("Range", "bytes=" + range[0] + "-" + range[1]);
    }
    xhr.setRequestHeader("If-Modified-Since", "Sat, 01 Jan 1970 00:00:00 GMT");
    xhr.send(null);
  }

  getByteAt(offset: number): number {
    var character = this._fileData.getByteAt(offset);
    return character.charCodeAt(0) & 0xff;
  }

  _createXHRObject(): XMLHttpRequest {
    if (typeof window === "undefined") {
      // $FlowIssue - flow is not able to recognize this module.
      return new (require("xhr2").XMLHttpRequest)();
    }

    if (window.XMLHttpRequest) {
      return new window.XMLHttpRequest();
    }

    throw new Error("XMLHttpRequest is not supported");
  }
}

module.exports = XhrFileReader;
