/* ============================================================================
   EuropaCraft Weather Simulator
   Persistent Atmospheric State
   Version 7.1

   NEW FILE

   PURPOSE

   This file stores the ACTUAL evolving atmosphere.

   It contains persistent fields for:

       temperature
       specific humidity
       relative humidity
       pressure
       wind U
       wind V
       cloud water / cloud fraction
       precipitation rate
       precipitation phase
       ground temperature
       snow depth
       boundary-layer mixing
       vertical motion proxy
       frontal strength
       air-mass origin tracers

   IMPORTANT DESIGN RULE

   Temperature anomaly is NOT stored as a forcing field.

   Actual temperature evolves physically.

   Anomaly is calculated later as:

       actual temperature
           -
       climatological temperature

   The atmosphere therefore exists independently of the anomaly display.

============================================================================ */

(function (global) {
"use strict";


const U = global.EuropaUtils;
const C = global.EuropaConfig;


/* ============================================================================
   PRECIPITATION PHASE ENUMERATION
============================================================================ */

const PHASE = Object.freeze({

    NONE: 0,

    SNOW: 1,

    SLEET: 2,

    RAIN: 3
});


/* ============================================================================
   AIR-MASS TRACER ENUMERATION

   These are NOT temperature presets.

   They are weak persistent tracers representing where air has recently spent
   time.

   Thermodynamic properties still evolve physically.

   Example:

       air can retain a high "continental" tracer after crossing the North Sea,
       while its actual temperature and humidity are substantially modified.

============================================================================ */

const AIR_MASS = Object.freeze({

    ATLANTIC: 0,

    ARCTIC: 1,

    CONTINENTAL: 2,

    MEDITERRANEAN: 3,

    NORTH_AFRICAN: 4,

    BALTIC: 5
});


const AIR_MASS_COUNT = 6;


/* ============================================================================
   INITIAL HUMIDITY ESTIMATION

   Used only to create a reasonable starting atmosphere.

   After initialization, humidity becomes persistent and evolves physically.
============================================================================ */

function initialRelativeHumidity(
    lat,
    lon,
    terrainSample,
    climateIndices
) {

    let rh = 0.70;


    rh += (
        climateIndices.maritime *
        0.16
    );


    rh += (
        climateIndices.atlantic *
        0.07
    );


    rh += (
        climateIndices.baltic *
        0.04
    );


    rh -= (
        climateIndices.continental *
        0.08
    );


    rh -= (
        climateIndices.dryInterior *
        0.18
    );


    if (
        terrainSample.landFraction <
        0.5
    ) {

        rh += 0.08;
    }


    return U.clamp(
        rh,
        0.35,
        0.96
    );
}


/* ============================================================================
   INITIAL GROUND TEMPERATURE

   Ground starts near climatology but responds more strongly than ocean SST.

   This is only initialization.
============================================================================ */

function initialGroundTemperature(
    airTemperatureC,
    terrainSample,
    climateIndices
) {

    let ground = airTemperatureC;


    if (
        terrainSample.landFraction >
        0.5
    ) {

        ground += (
            climateIndices.continental *
            0.5
        );
    }


    return ground;
}


/* ============================================================================
   ATMOSPHERE CLASS
============================================================================ */

class Atmosphere {

    constructor(
        terrain,
        ocean,
        synoptic,
        date
    ) {

        this.terrain = terrain;

        this.ocean = ocean;

        this.synoptic = synoptic;


        this.nx = terrain.nx;

        this.ny = terrain.ny;

        this.n = terrain.n;


        /* ====================================================================
           MAIN THERMODYNAMIC STATE
           ==================================================================== */

        this.temperatureC = new Float32Array(
            this.n
        );


        this.specificHumidity = new Float32Array(
            this.n
        );


        this.relativeHumidity = new Float32Array(
            this.n
        );


        this.pressureHpa = new Float32Array(
            this.n
        );


        /* ====================================================================
           WIND
           ==================================================================== */

        this.windU = new Float32Array(
            this.n
        );


        this.windV = new Float32Array(
            this.n
        );


        this.windSpeed = new Float32Array(
            this.n
        );


        this.windDirectionDeg = new Float32Array(
            this.n
        );


        /* ====================================================================
           CLOUD AND PRECIPITATION
           ==================================================================== */

        this.cloudFraction = new Float32Array(
            this.n
        );


        this.cloudWater = new Float32Array(
            this.n
        );


        this.precipRateMmHr = new Float32Array(
            this.n
        );


        this.precipPhase = new Uint8Array(
            this.n
        );


        /* ====================================================================
           SURFACE STATE
           ==================================================================== */

        this.groundTemperatureC = new Float32Array(
            this.n
        );


        this.snowDepthCm = new Float32Array(
            this.n
        );


        this.surfaceWetness = new Float32Array(
            this.n
        );


        /* ====================================================================
           DYNAMIC DIAGNOSTIC STATE

           These are physically meaningful intermediate fields that are useful
           for the physics and renderer.

           They are NOT arbitrary noise layers.
           ==================================================================== */

        this.verticalMotion = new Float32Array(
            this.n
        );


        this.convergence = new Float32Array(
            this.n
        );


        this.frontStrength = new Float32Array(
            this.n
        );


        this.boundaryLayerMixing = new Float32Array(
            this.n
        );


        this.stability = new Float32Array(
            this.n
        );


        /* ====================================================================
           CLIMATOLOGICAL DIAGNOSTIC

           This field is allowed because it is only a REFERENCE.

           Physics must not read anomalyC as forcing.
           ==================================================================== */

        this.climatologyC = new Float32Array(
            this.n
        );


        this.anomalyC = new Float32Array(
            this.n
        );


        /* ====================================================================
           AIR-MASS HISTORY TRACERS

           Flat packed:

               tracerIndex =
                   cellIndex * AIR_MASS_COUNT
                   +
                   airMassIndex
           ==================================================================== */

        this.airMassTracer = new Float32Array(
            this.n *
            AIR_MASS_COUNT
        );


        /* ====================================================================
           TEMPORARY SOURCE-AIR MEMORY

           Useful for determining whether recently transported air remains
           recognisably continental, maritime, Arctic, etc.

           This does NOT freeze its temperature.
           ==================================================================== */

        this.airMassAgeHours = new Float32Array(
            this.n
        );


        this.lastSeaContactHours = new Float32Array(
            this.n
        );


        this.lastLandContactHours = new Float32Array(
            this.n
        );


        this.initialize(
            date
        );
    }


    /* ========================================================================
       INITIALIZATION
       ======================================================================== */

    initialize(
        dateInput
    ) {

        const date = (
            dateInput instanceof Date
                ? dateInput
                : new Date(dateInput)
        );


        const synopticPressure = (
            this.synoptic
                ? this.synoptic.pressureField()
                : null
        );


        for (
            let i = 0;
            i < this.n;
            i++
        ) {

            const lat = (
                this.terrain.lat[i]
            );


            const lon = (
                this.terrain.lon[i]
            );


            const terrainSample = {

                landFraction:
                    this.terrain.land[i],

                altitudeM:
                    this.terrain.altitudeM[i],

                maritime:
                    this.terrain.maritime[i],

                continental:
                    this.terrain.continental[i]
            };


            const climateData = (
                global.EuropaClimate.getBaselineTemperature(
                    lat,
                    lon,
                    date,
                    {
                        terrain:
                            terrainSample
                    }
                )
            );


            const indices = (
                climateData.indices
            );


            /* ================================================================
               CLIMATOLOGICAL REFERENCE
               ================================================================ */

            this.climatologyC[i] = (
                climateData.hourlyC
            );


            /* ================================================================
               ACTUAL INITIAL TEMPERATURE

               Starts near climatology.

               No artificial anomaly pattern is added.

               Differences subsequently emerge through pressure, transport,
               surface exchange, radiation and synoptic evolution.
               ================================================================ */

            let temperature = (
                climateData.hourlyC
            );


            /*
             * Sea-starting atmosphere is nudged modestly toward SST so the
             * initial boundary layer is not grossly inconsistent.
             */

            if (
                terrainSample.landFraction <
                0.5 &&
                this.ocean
            ) {

                const sst = (
                    this.ocean.sst[i]
                );


                temperature = U.lerp(
                    temperature,
                    sst,
                    0.28
                );
            }


            this.temperatureC[i] = (
                temperature
            );


            /* ================================================================
               PRESSURE
               ================================================================ */

            this.pressureHpa[i] = (
                synopticPressure
                    ? synopticPressure[i]
                    : 1015
            );


            /* ================================================================
               INITIAL HUMIDITY
               ================================================================ */

            const initialRH = (
                initialRelativeHumidity(
                    lat,
                    lon,
                    terrainSample,
                    indices
                )
            );


            this.relativeHumidity[i] = (
                initialRH
            );


            const saturationHumidity = (
                U.qsatFromTempPressure(
                    temperature,
                    this.pressureHpa[i]
                )
            );


            this.specificHumidity[i] = (
                saturationHumidity *
                initialRH
            );


            /* ================================================================
               INITIAL CLOUD

               Only broad initialization.

               No random cloud blotches.
               ================================================================ */

            const cloudThreshold = (
                0.72
            );


            const cloudFraction = U.clamp(
                (
                    initialRH -
                    cloudThreshold
                ) /
                (
                    1 -
                    cloudThreshold
                ),

                0,
                1
            );


            this.cloudFraction[i] = (
                cloudFraction *
                0.55
            );


            this.cloudWater[i] = (
                this.cloudFraction[i] *
                0.18
            );


            /* ================================================================
               SURFACE
               ================================================================ */

            this.groundTemperatureC[i] = (
                initialGroundTemperature(
                    temperature,
                    terrainSample,
                    indices
                )
            );


            this.snowDepthCm[i] = 0;


            this.surfaceWetness[i] = U.clamp(
                initialRH *
                0.35,
                0,
                1
            );


            /* ================================================================
               DYNAMIC DIAGNOSTICS
               ================================================================ */

            this.verticalMotion[i] = 0;

            this.convergence[i] = 0;

            this.frontStrength[i] = 0;

            this.boundaryLayerMixing[i] = (
                terrainSample.landFraction > 0.5
                    ? C.atmosphere.mixingRateLand
                    : C.atmosphere.mixingRateSea
            );


            this.stability[i] = 0.5;


            /* ================================================================
               AIR-MASS TRACERS
               ================================================================ */

            this._initializeAirMassTracer(
                i,
                indices
            );


            this.airMassAgeHours[i] = 0;


            if (
                terrainSample.landFraction <
                0.5
            ) {

                this.lastSeaContactHours[i] = 0;

                this.lastLandContactHours[i] = 999;
            }

            else {

                this.lastSeaContactHours[i] = 999;

                this.lastLandContactHours[i] = 0;
            }
        }


        this._initializeWind();


        this.updateDerivedFields(
            date
        );
    }


    /* ========================================================================
       INITIAL AIR-MASS TRACERS
       ======================================================================== */

    _initializeAirMassTracer(
        cellIndex,
        indices
    ) {

        const base = (
            cellIndex *
            AIR_MASS_COUNT
        );


        let atlantic = (
            indices.atlantic
        );


        let arctic = (
            indices.arctic
        );


        let continental = (
            indices.continental
        );


        let mediterranean = (
            indices.mediterranean
        );


        let northAfrican = (
            indices.dryInterior *
            indices.mediterranean *
            0.7
        );


        let baltic = (
            indices.baltic
        );


        let total = (
            atlantic +
            arctic +
            continental +
            mediterranean +
            northAfrican +
            baltic
        );


        if (
            total <= 0.0001
        ) {

            continental = 1;

            total = 1;
        }


        this.airMassTracer[
            base + AIR_MASS.ATLANTIC
        ] = (
            atlantic /
            total
        );


        this.airMassTracer[
            base + AIR_MASS.ARCTIC
        ] = (
            arctic /
            total
        );


        this.airMassTracer[
            base + AIR_MASS.CONTINENTAL
        ] = (
            continental /
            total
        );


        this.airMassTracer[
            base + AIR_MASS.MEDITERRANEAN
        ] = (
            mediterranean /
            total
        );


        this.airMassTracer[
            base + AIR_MASS.NORTH_AFRICAN
        ] = (
            northAfrican /
            total
        );


        this.airMassTracer[
            base + AIR_MASS.BALTIC
        ] = (
            baltic /
            total
        );
    }


    /* ========================================================================
       INITIAL WIND
       ======================================================================== */

    _initializeWind() {

        for (
            let i = 0;
            i < this.n;
            i++
        ) {

            const lat = (
                this.terrain.lat[i]
            );


            const lon = (
                this.terrain.lon[i]
            );


            let u = 0;

            let v = 0;


            if (
                this.synoptic
            ) {

                const guidance = (
                    this.synoptic.guidanceWindAt(
                        lat,
                        lon
                    )
                );


                u += guidance.u;

                v += guidance.v;
            }


            /*
             * Weak climatological westerly background.
             *
             * This is intentionally modest so synoptic systems dominate.
             */

            if (
                lat >= 40 &&
                lat <= 67
            ) {

                const midLatitudeFactor = U.clamp(
                    1 -
                    Math.abs(
                        lat - 54
                    ) /
                    20,

                    0,
                    1
                );


                u += (
                    2.5 +
                    midLatitudeFactor *
                    3.0
                );
            }


            this.windU[i] = (
                u
            );


            this.windV[i] = (
                v
            );
        }
    }


    /* ========================================================================
       UPDATE DERIVED FIELDS
       ======================================================================== */

    updateDerivedFields(
        dateInput
    ) {

        const date = (
            dateInput instanceof Date
                ? dateInput
                : new Date(dateInput)
        );


        for (
            let i = 0;
            i < this.n;
            i++
        ) {

            const temperature = (
                this.temperatureC[i]
            );


            const pressure = (
                this.pressureHpa[i]
            );


            const specificHumidity = (
                this.specificHumidity[i]
            );


            /* ================================================================
               RELATIVE HUMIDITY
               ================================================================ */

            this.relativeHumidity[i] = (
                U.relativeHumidity(
                    temperature,
                    pressure,
                    specificHumidity
                )
            );


            /* ================================================================
               WIND SPEED / DIRECTION
               ================================================================ */

            const u = (
                this.windU[i]
            );


            const v = (
                this.windV[i]
            );


            this.windSpeed[i] = (
                Math.hypot(
                    u,
                    v
                )
            );


            this.windDirectionDeg[i] = (
                U.bearingFromVector(
                    u,
                    v
                )
            );


            /* ================================================================
               CLIMATOLOGICAL TEMPERATURE
               ================================================================ */

            const terrainSample = {

                landFraction:
                    this.terrain.land[i],

                altitudeM:
                    this.terrain.altitudeM[i],

                maritime:
                    this.terrain.maritime[i],

                continental:
                    this.terrain.continental[i]
            };


            const climate = (
                global.EuropaClimate.getBaselineTemperature(

                    this.terrain.lat[i],

                    this.terrain.lon[i],

                    date,

                    {
                        terrain:
                            terrainSample
                    }
                )
            );


            this.climatologyC[i] = (
                climate.hourlyC
            );


            /* ================================================================
               ANOMALY

               Diagnostic only.

               NEVER feed this value back into temperature physics.
               ================================================================ */

            this.anomalyC[i] = (
                this.temperatureC[i] -
                this.climatologyC[i]
            );


            /* ================================================================
               PRECIPITATION PHASE
               ================================================================ */

            const precipRate = (
                this.precipRateMmHr[i]
            );


            if (
                precipRate <= 0.005
            ) {

                this.precipPhase[i] = (
                    PHASE.NONE
                );
            }

            else if (
                temperature <=
                C.precipitationPhase.snowMaxC
            ) {

                this.precipPhase[i] = (
                    PHASE.SNOW
                );
            }

            else if (
                temperature <=
                C.precipitationPhase.sleetMaxC
            ) {

                this.precipPhase[i] = (
                    PHASE.SLEET
                );
            }

            else {

                this.precipPhase[i] = (
                    PHASE.RAIN
                );
            }
        }
    }


    /* ========================================================================
       AIR-MASS TRACER ACCESS
       ======================================================================== */

    getAirMassTracer(
        cellIndex,
        airMass
    ) {

        return this.airMassTracer[
            cellIndex *
            AIR_MASS_COUNT +
            airMass
        ];
    }


    setAirMassTracer(
        cellIndex,
        airMass,
        value
    ) {

        this.airMassTracer[
            cellIndex *
            AIR_MASS_COUNT +
            airMass
        ] = U.clamp(
            value,
            0,
            1
        );
    }


    normalizeAirMassTracer(
        cellIndex
    ) {

        const base = (
            cellIndex *
            AIR_MASS_COUNT
        );


        let total = 0;


        for (
            let k = 0;
            k < AIR_MASS_COUNT;
            k++
        ) {

            total += Math.max(
                0,
                this.airMassTracer[
                    base + k
                ]
            );
        }


        if (
            total <= 0.000001
        ) {

            this.airMassTracer[
                base + AIR_MASS.CONTINENTAL
            ] = 1;


            for (
                let k = 0;
                k < AIR_MASS_COUNT;
                k++
            ) {

                if (
                    k !== AIR_MASS.CONTINENTAL
                ) {

                    this.airMassTracer[
                        base + k
                    ] = 0;
                }
            }


            return;
        }


        for (
            let k = 0;
            k < AIR_MASS_COUNT;
            k++
        ) {

            this.airMassTracer[
                base + k
            ] = (
                Math.max(
                    0,
                    this.airMassTracer[
                        base + k
                    ]
                ) /
                total
            );
        }
    }


    dominantAirMass(
        cellIndex
    ) {

        const base = (
            cellIndex *
            AIR_MASS_COUNT
        );


        let bestIndex = 0;

        let bestValue = -Infinity;


        for (
            let k = 0;
            k < AIR_MASS_COUNT;
            k++
        ) {

            const value = (
                this.airMassTracer[
                    base + k
                ]
            );


            if (
                value >
                bestValue
            ) {

                bestValue = value;

                bestIndex = k;
            }
        }


        return {

            type:
                bestIndex,

            fraction:
                bestValue
        };
    }


    /* ========================================================================
       PRECIPITATION PHASE STRING
       ======================================================================== */

    precipPhaseName(
        phaseValue
    ) {

        switch (
            phaseValue
        ) {

            case PHASE.SNOW:
                return "Snow";

            case PHASE.SLEET:
                return "Sleet";

            case PHASE.RAIN:
                return "Rain";

            default:
                return "None";
        }
    }


    /* ========================================================================
       CELL SAMPLING
       ======================================================================== */

    sample(
        lat,
        lon
    ) {

        const terrainSample = (
            this.terrain.sample(
                lat,
                lon
            )
        );


        const sampleArray = (
            array
        ) => (
            this.terrain.sampleArray(
                array,
                lat,
                lon
            )
        );


        const temperatureC = (
            sampleArray(
                this.temperatureC
            )
        );


        const climatologyC = (
            sampleArray(
                this.climatologyC
            )
        );


        const anomalyC = (
            temperatureC -
            climatologyC
        );


        const pressureHpa = (
            sampleArray(
                this.pressureHpa
            )
        );


        const specificHumidity = (
            sampleArray(
                this.specificHumidity
            )
        );


        const relativeHumidity = (
            U.relativeHumidity(
                temperatureC,
                pressureHpa,
                specificHumidity
            )
        );


        const windU = (
            sampleArray(
                this.windU
            )
        );


        const windV = (
            sampleArray(
                this.windV
            )
        );


        const windSpeed = (
            Math.hypot(
                windU,
                windV
            )
        );


        const precipRateMmHr = (
            sampleArray(
                this.precipRateMmHr
            )
        );


        let phase = PHASE.NONE;


        if (
            precipRateMmHr >
            0.005
        ) {

            if (
                temperatureC <=
                C.precipitationPhase.snowMaxC
            ) {

                phase = PHASE.SNOW;
            }

            else if (
                temperatureC <=
                C.precipitationPhase.sleetMaxC
            ) {

                phase = PHASE.SLEET;
            }

            else {

                phase = PHASE.RAIN;
            }
        }


        let sstC = null;


        if (
            terrainSample.landFraction <
            0.55 &&
            this.ocean
        ) {

            sstC = (
                this.ocean.sample(
                    lat,
                    lon
                )
            );
        }


        return {

            lat,

            lon,


            temperatureC,

            climatologyC,

            anomalyC,


            pressureHpa,


            specificHumidity,

            relativeHumidity,


            windU,

            windV,

            windSpeed,

            windDirectionDeg:
                U.bearingFromVector(
                    windU,
                    windV
                ),


            cloudFraction:
                sampleArray(
                    this.cloudFraction
                ),

            cloudWater:
                sampleArray(
                    this.cloudWater
                ),


            precipRateMmHr,

            precipPhase:
                phase,

            precipPhaseName:
                this.precipPhaseName(
                    phase
                ),


            groundTemperatureC:
                sampleArray(
                    this.groundTemperatureC
                ),

            snowDepthCm:
                sampleArray(
                    this.snowDepthCm
                ),

            surfaceWetness:
                sampleArray(
                    this.surfaceWetness
                ),


            verticalMotion:
                sampleArray(
                    this.verticalMotion
                ),

            convergence:
                sampleArray(
                    this.convergence
                ),

            frontStrength:
                sampleArray(
                    this.frontStrength
                ),

            boundaryLayerMixing:
                sampleArray(
                    this.boundaryLayerMixing
                ),

            stability:
                sampleArray(
                    this.stability
                ),


            sstC,


            terrain:
                terrainSample
        };
    }


    /* ========================================================================
       SNAPSHOT SUPPORT

       History.js can store these arrays and restore them when scrubbing
       backwards through the timeline.
       ======================================================================== */

    createSnapshot() {

        return {

            temperatureC:
                new Float32Array(
                    this.temperatureC
                ),

            specificHumidity:
                new Float32Array(
                    this.specificHumidity
                ),

            pressureHpa:
                new Float32Array(
                    this.pressureHpa
                ),

            windU:
                new Float32Array(
                    this.windU
                ),

            windV:
                new Float32Array(
                    this.windV
                ),

            cloudFraction:
                new Float32Array(
                    this.cloudFraction
                ),

            cloudWater:
                new Float32Array(
                    this.cloudWater
                ),

            precipRateMmHr:
                new Float32Array(
                    this.precipRateMmHr
                ),

            precipPhase:
                new Uint8Array(
                    this.precipPhase
                ),

            groundTemperatureC:
                new Float32Array(
                    this.groundTemperatureC
                ),

            snowDepthCm:
                new Float32Array(
                    this.snowDepthCm
                ),

            surfaceWetness:
                new Float32Array(
                    this.surfaceWetness
                ),

            verticalMotion:
                new Float32Array(
                    this.verticalMotion
                ),

            convergence:
                new Float32Array(
                    this.convergence
                ),

            frontStrength:
                new Float32Array(
                    this.frontStrength
                ),

            boundaryLayerMixing:
                new Float32Array(
                    this.boundaryLayerMixing
                ),

            stability:
                new Float32Array(
                    this.stability
                ),

            airMassTracer:
                new Float32Array(
                    this.airMassTracer
                ),

            airMassAgeHours:
                new Float32Array(
                    this.airMassAgeHours
                ),

            lastSeaContactHours:
                new Float32Array(
                    this.lastSeaContactHours
                ),

            lastLandContactHours:
                new Float32Array(
                    this.lastLandContactHours
                )
        };
    }


    /* ========================================================================
       SNAPSHOT RESTORE
       ======================================================================== */

    restoreSnapshot(
        snapshot
    ) {

        if (
            !snapshot
        ) {

            return;
        }


        const restore = (
            destination,
            source
        ) => {

            if (
                source &&
                source.length ===
                destination.length
            ) {

                destination.set(
                    source
                );
            }
        };


        restore(
            this.temperatureC,
            snapshot.temperatureC
        );


        restore(
            this.specificHumidity,
            snapshot.specificHumidity
        );


        restore(
            this.pressureHpa,
            snapshot.pressureHpa
        );


        restore(
            this.windU,
            snapshot.windU
        );


        restore(
            this.windV,
            snapshot.windV
        );


        restore(
            this.cloudFraction,
            snapshot.cloudFraction
        );


        restore(
            this.cloudWater,
            snapshot.cloudWater
        );


        restore(
            this.precipRateMmHr,
            snapshot.precipRateMmHr
        );


        restore(
            this.precipPhase,
            snapshot.precipPhase
        );


        restore(
            this.groundTemperatureC,
            snapshot.groundTemperatureC
        );


        restore(
            this.snowDepthCm,
            snapshot.snowDepthCm
        );


        restore(
            this.surfaceWetness,
            snapshot.surfaceWetness
        );


        restore(
            this.verticalMotion,
            snapshot.verticalMotion
        );


        restore(
            this.convergence,
            snapshot.convergence
        );


        restore(
            this.frontStrength,
            snapshot.frontStrength
        );


        restore(
            this.boundaryLayerMixing,
            snapshot.boundaryLayerMixing
        );


        restore(
            this.stability,
            snapshot.stability
        );


        restore(
            this.airMassTracer,
            snapshot.airMassTracer
        );


        restore(
            this.airMassAgeHours,
            snapshot.airMassAgeHours
        );


        restore(
            this.lastSeaContactHours,
            snapshot.lastSeaContactHours
        );


        restore(
            this.lastLandContactHours,
            snapshot.lastLandContactHours
        );


        /*
         * relativeHumidity, windSpeed, climatology and anomaly are all derived
         * quantities and are recalculated separately.
         */
    }
}


/* ============================================================================
   EXPORT
============================================================================ */

global.EuropaAtmosphere = Atmosphere;

global.EuropaPrecipPhase = PHASE;

global.EuropaAirMass = AIR_MASS;

global.EuropaAirMassCount = AIR_MASS_COUNT;

})(window);
