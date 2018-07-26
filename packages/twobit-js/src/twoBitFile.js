const Parser = require('binary-parser').Parser

const fs = typeof window === 'undefined' ? require('fs-extra') : undefined

const TWOBIT_MAGIC = 0x1a412743

function tinyMemoize(_class, methodName) {
  const method = _class.prototype[methodName]
  const memoAttrName = `_memo_${methodName}`
  _class.prototype[methodName] = function _tinyMemoized() {
    if (!(memoAttrName in this)) this[memoAttrName] = method.call(this)
    return this[memoAttrName]
  }
}

const twoBit = ['T', 'C', 'A', 'G']
// byteTo4Bases is an array of byteValue -> 'ACTG'
// the weird `...keys()` incantation generates an array of numbers 0 to 255
const byteTo4Bases = [...Array(256).keys()].map(
  (x, i) =>
    twoBit[(i >> 6) & 3] +
    twoBit[(i >> 4) & 3] +
    twoBit[(i >> 2) & 3] +
    twoBit[i & 3],
)
const maskedByteTo4Bases = byteTo4Bases.map(bases => bases.toLowerCase())

// LocalFile is pretty much just an implementation of the node 10+ fs.promises filehandle,
// can switch to that when the API is stable
class LocalFile {
  constructor(path) {
    this.fdPromise = fs.open(path, 'r')
  }

  async read(buf, offset, length, position) {
    const fd = await this.fdPromise
    await fs.read(fd, buf, offset, length, position)
  }
}

class TwoBitFile {
  /**
   * @param {object} args
   * @param {string} args.path filesystem path for the .2bit file to open
   * @param {Filehandle} args.filehandle node fs.promises filehandle for the .2bit file
   * @param {number} [args.seqChunkSize] size of chunks of sequence bytes to fetch. default 32KiB
   */
  constructor({ filehandle, path, seqChunkSize }) {
    if (filehandle) this.filehandle = filehandle
    else if (path) this.filehandle = new LocalFile(path)
    this.isBigEndian = undefined
    this.seqChunkSize = seqChunkSize || 32000
  }

  async _getParser(name) {
    const parser = (await this._getParsers())[name]
    if (!parser) throw new Error(`parser ${name} not found`)
    return parser
  }

  async _detectEndianness() {
    const buf = Buffer.allocUnsafe(4)
    await this.filehandle.read(buf, 0, 4, 0)
    if (buf.readInt32LE() === TWOBIT_MAGIC) {
      this.isBigEndian = false
    } else if (buf.readInt32BE() === TWOBIT_MAGIC) {
      this.isBigEndian = true
    } else {
      throw new Error('not a 2bit file')
    }
  }

  // memoize
  /**
   * @private
   * detects the file's endianness and instantiates our binary parsers accordingly
   */
  async _getParsers() {
    await this._detectEndianness()

    const endianess = this.isBigEndian ? 'big' : 'little'
    const lebe = this.isBigEndian ? 'be' : 'le'
    return {
      header: new Parser()
        .endianess(endianess)
        .int32('magic', {
          assert: m => m === 0x1a412743,
        })
        .int32('version', {
          assert: v => v === 0,
        })
        .int32('sequenceCount', {
          assert: v => v >= 0,
        })
        .int32('reserved'),
      index: new Parser()
        .endianess(endianess)
        .int32('sequenceCount')
        .int32('reserved')
        .array('index', {
          length: 'sequenceCount',
          type: new Parser()
            .endianess(endianess)
            .uint8('nameLength')
            .string('name', { length: 'nameLength' })
            .uint32('offset'),
        }),
      record1: new Parser()
        .endianess(endianess)
        .int32('dnaSize')
        .int32('nBlockCount'),
      record2: new Parser()
        .endianess(endianess)
        .int32('nBlockCount')
        .array('nBlockStarts', {
          length: 'nBlockCount',
          type: `int32${lebe}`,
        })
        .array('nBlockSizes', {
          length: 'nBlockCount',
          type: `int32${lebe}`,
        })
        .int32('maskBlockCount'),
      record3: new Parser()
        .endianess(endianess)
        .int32('maskBlockCount')
        .array('maskBlockStarts', {
          length: 'maskBlockCount',
          type: `int32${lebe}`,
        })
        .array('maskBlockSizes', {
          length: 'maskBlockCount',
          type: `int32${lebe}`,
        })
        .int32('reserved'),
      // .buffer('packedDna', { length: 'dnaSize' }),
    }
  }

  // memoize
  async getHeader() {
    await this._detectEndianness()

    const buf = Buffer.allocUnsafe(16)
    await this.filehandle.read(buf, 0, 16, 0)

    const headerParser = await this._getParser('header')
    return headerParser.parse(buf)
  }

  // memoize
  async getIndex() {
    const header = await this.getHeader()
    const maxIndexLength = 8 + header.sequenceCount * (1 + 256 + 4)
    const buf = Buffer.allocUnsafe(maxIndexLength)
    await this.filehandle.read(buf, 0, maxIndexLength, 8)
    const indexParser = await this._getParser('index')
    const indexData = indexParser.parse(buf).index
    const index = {}
    indexData.forEach(({ name, offset }) => {
      index[name] = offset
    })
    return index
  }

  /**
   * @returns [Promise] for an object as seqName => length
   */
  async getSeqSizes() {
    // TODO
  }

  // /**
  //  * @returns async iterator of string sequence names
  //  */
  // async *listSequences() {
  //   const index = await this.getIndex()
  // }

  async _getSequenceRecord(offset) {
    // we have to parse the sequence record in 3 parts, because we have to buffer 3 fixed-length file reads
    if (offset === undefined) throw new Error('invalid offset')
    const rec1 = await this._parseItem(offset, 8, 'record1')
    const rec2DataLength = rec1.nBlockCount * 8 + 8
    const rec2 = await this._parseItem(offset + 4, rec2DataLength, 'record2')
    const rec3DataLength = rec2.maskBlockCount * 8 + 8
    const rec3 = await this._parseItem(
      offset + 4 + rec2DataLength - 4,
      rec3DataLength,
      'record3',
    )
    // const nBlocks = rec2.nBlockSizes.map((size, i) => ({
    //   end: rec2.nBlockStarts[i] + size,
    //   start: rec2.nBlockStarts[i],
    //   size,
    // }))
    // const maskBlocks = rec3.maskBlockSizes.map((size, i) => ({
    //   end: rec3.maskBlockStarts[i] + size,
    //   start: rec3.maskBlockStarts[i],
    //   size,
    // }))

    const rec = {
      dnaSize: rec1.dnaSize,
      nBlocks: { starts: rec2.nBlockStarts, sizes: rec2.nBlockSizes },
      maskBlocks: { starts: rec3.maskBlockStarts, sizes: rec3.maskBlockSizes },
      dnaPosition: offset + 4 + rec2DataLength - 4 + rec3DataLength,
      // dnaPosition2:
      //   offset + 8 + nBlocks.length * 8 + 4 + maskBlocks.length * 8 + 4,
    }
    return rec
  }

  async _parseItem(offset, length, parserName) {
    const buf = Buffer.allocUnsafe(length)
    await this.filehandle.read(buf, 0, length, offset)
    const parser = await this._getParser(parserName)
    return parser.parse(buf)
  }

  /**
   * @param {string} seqName
   * @param {number} [start] optional 0-based half-open start of the sequence region to fetch. default 0.
   * @param {number} [end] optional 0-based half-open end of the sequence region to fetch. defaults to end of the sequence
   * @returns {Promise} promise for a string of sequence bases
   */
  async getSequence(seqName, regionStart = 0, regionEnd) {
    const index = await this.getIndex()
    const offset = index[seqName]
    if (!offset) {
      return undefined
    }
    // fetch the record for the seq
    const record = await this._getSequenceRecord(offset)

    // end defaults to the end of the sequence
    if (regionEnd === undefined) {
      regionEnd = record.dnaSize
    }

    const nBlocks = this._getOverlappingBlocks(
      regionStart,
      regionEnd,
      record.nBlocks.starts,
      record.nBlocks.sizes,
    )
    const maskBlocks = this._getOverlappingBlocks(
      regionStart,
      regionEnd,
      record.maskBlocks.starts,
      record.maskBlocks.sizes,
    )

    const baseBytes = Buffer.allocUnsafe(
      Math.ceil((regionEnd - regionStart) / 4),
    )
    const baseBytesOffset = Math.floor(regionStart / 4)
    await this.filehandle.read(
      baseBytes,
      0,
      baseBytes.length,
      record.dnaPosition + baseBytesOffset,
    )

    let sequenceBases = ''
    for (
      let genomicPosition = regionStart;
      genomicPosition < regionEnd;
      genomicPosition += 1
    ) {
      // check whether we are currently masked
      while (maskBlocks.length && maskBlocks[0].end <= genomicPosition)
        maskBlocks.shift()
      const baseIsMasked =
        maskBlocks[0] &&
        maskBlocks[0].start <= genomicPosition &&
        maskBlocks[0].end > genomicPosition

      // process the N block if we have one
      if (
        nBlocks[0] &&
        genomicPosition >= nBlocks[0].start &&
        genomicPosition < nBlocks[0].end
      ) {
        const currentNBlock = nBlocks.shift()
        for (
          ;
          genomicPosition < currentNBlock.end && genomicPosition < regionEnd;
          genomicPosition += 1
        ) {
          sequenceBases += baseIsMasked ? 'n' : 'N'
        }
        genomicPosition -= 1
      } else {
        const bytePosition = Math.floor(genomicPosition / 4) - baseBytesOffset
        const subPosition = genomicPosition % 4
        const byte = baseBytes[bytePosition]
        sequenceBases += baseIsMasked
          ? maskedByteTo4Bases[byte][subPosition]
          : byteTo4Bases[byte][subPosition]
      }
    }

    return sequenceBases
  }

  // _getDnaChunk(dnaPosition, chunkNumber) {
  //   // keep a one-chunk cache of DNA chunks.  might instead think
  //   // about keeping an LRU cache instead at some point
  //   if (this.currentDnaChunkNumber !== chunkNumber) {
  //     const dnaBytes = Buffer.allocUnsafe(this.seqChunkSize)
  //     this.currentDnaChunkNumber = chunkNumber
  //     this.currentDnaChunk = this.filehandle
  //       .read(
  //         dnaBytes,
  //         0,
  //         this.seqChunkSize,
  //         dnaPosition + chunkNumber * this.seqChunkSize,
  //       )
  //       .then(() => dnaBytes)
  //   }
  //   return this.currentDnaChunk
  // }

  // _getBasePair(record, bytePosition, subPosition) {
  //   const chunkNumber = Math.floor(bytePosition / this.seqChunkSize)
  //   const chunkPromise = this._getDnaChunk(record.dnaPosition, chunkNumber)
  //   return chunkPromise.then(chunk => {
  //     const currentByteBases =
  //       byteTo4Bases[chunk[bytePosition - chunkNumber * this.seqChunkSize]]
  //     return currentByteBases[subPosition]
  //   })
  // }

  _getOverlappingBlocks(regionStart, regionEnd, blockStarts, blockSizes) {
    // find the start and end indexes of the blocks that match
    let startIndex
    let endIndex
    for (let i = 0; i < blockStarts.length; i += 1) {
      const blockStart = blockStarts[i]
      const blockSize = blockSizes[i]
      if (regionStart >= blockStart + blockSize || regionEnd <= blockStart) {
        // block does not overlap the region
        if (startIndex !== undefined) {
          endIndex = i
          break
        }
      } else if (startIndex === undefined) startIndex = i // block does overlap the region, record this if it is the first
    }

    if (startIndex === undefined) return []

    // now format some block objects to return
    if (endIndex === undefined) endIndex = blockStarts.length

    const blocks = new Array(endIndex - startIndex)
    for (let blockNum = startIndex; blockNum < endIndex; blockNum += 1) {
      blocks[blockNum - startIndex] = {
        start: blockStarts[blockNum],
        end: blockStarts[blockNum] + blockSizes[blockNum],
        size: blockSizes[blockNum],
      }
    }
    return blocks
  }
}

module.exports = TwoBitFile