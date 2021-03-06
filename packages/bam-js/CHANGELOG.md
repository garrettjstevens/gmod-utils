<a name="1.0.14"></a>
## [1.0.14](https://github.com/GMOD/bam-js/compare/v1.0.13...v1.0.14) (2019-01-04)



- Add hasRefSeq for CSI indexes

<a name="1.0.13"></a>
## [1.0.13](https://github.com/GMOD/bam-js/compare/v1.0.12...v1.0.13) (2018-12-25)



- Use ascii decoding for read names
- Fix error with large BAM headers with many refseqs

<a name="1.0.12"></a>
## [1.0.12](https://github.com/GMOD/bam-js/compare/v1.0.11...v1.0.12) (2018-11-25)



- Faster viewAsPairs operation

<a name="1.0.11"></a>
## [1.0.11](https://github.com/GMOD/bam-js/compare/v1.0.10...v1.0.11) (2018-11-23)



- Fix for ie11

<a name="1.0.10"></a>
## [1.0.10](https://github.com/GMOD/bam-js/compare/v1.0.9...v1.0.10) (2018-11-18)



- Add a maxInsertSize parameter to getRecordsForRange

<a name="1.0.9"></a>
## [1.0.9](https://github.com/GMOD/bam-js/compare/v1.0.8...v1.0.9) (2018-11-16)



- Allow bases other than ACGT to be decoded
- Make viewAsPairs only resolve pairs on given refSeq unless pairAcrossChr is enabled for query

<a name="1.0.8"></a>
## [1.0.8](https://github.com/GMOD/bam-js/compare/v1.0.7...v1.0.8) (2018-10-31)



- Add getPairOrientation for reads

<a name="1.0.7"></a>
## [1.0.7](https://github.com/GMOD/bam-js/compare/v1.0.6...v1.0.7) (2018-10-19)


- Re-release of 1.0.6 due to build machinery error

<a name="1.0.6"></a>
## [1.0.6](https://github.com/GMOD/bam-js/compare/v1.0.5...v1.0.6) (2018-10-19)



- Add bugfix for where bytes for an invalid request returns 0 resulting in pako unzip errors

<a name="1.0.5"></a>
## [1.0.5](https://github.com/GMOD/bam-js/compare/v1.0.4...v1.0.5) (2018-10-16)



- Add a bugfix for pairing reads related to adding duplicate records to results

<a name="1.0.4"></a>
## [1.0.4](https://github.com/GMOD/bam-js/compare/v1.0.3...v1.0.4) (2018-10-13)

- Support pairing reads
- Fix pseudobin parsing containing feature count on certain BAM files

<a name="1.0.3"></a>
## [1.0.3](https://github.com/GMOD/bam-js/compare/v1.0.2...v1.0.3) (2018-09-25)

- Remove @gmod/tabix dependency

<a name="1.0.2"></a>
## [1.0.2](https://github.com/GMOD/bam-js/compare/v1.0.1...v1.0.2) (2018-09-25)

- Fix CSI indexing code


<a name="1.0.1"></a>
## [1.0.1](https://github.com/GMOD/bam-js/compare/v1.0.0...v1.0.1) (2018-09-24)

- Rename hasDataForReferenceSequence to hasRefSeq

<a name="1.0.0"></a>
# 1.0.0 (2018-09-24)


- Initial implementation of BAM parsing code
