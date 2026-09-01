/*
 * EuropaCraft Atmospheric Simulation
 * V10 Ocean Engine
 *
 * Persistent sea-surface temperature model.
 *
 * Responsibilities:
 *
 * - Maintain SST as prognostic state.
 * - Provide geographically sensible seasonal SST targets.
 * - Give open oceans greater thermal inertia than enclosed/shallow seas.
 * - Allow sustained atmospheric conditions to modify SST.
 * - Preserve SST memory between physics steps.
 *
 * IMPORTANT:
 *
 * SST is NOT a cosmetic monthly temperature field.
 *
 * The V10 atmosphere exchanges heat and moisture with this persistent
 * ocean state. Cold air passing across warm water can therefore gain
 * heat and moisture, while persistent cold/warm weather can gradually
 * modify the sea surface itself.
 */

(function (global) {
    "use strict";


    const C =
        global.EuropaConfig;

    const U =
        global.EuropaUtils;


    if (!C) {
        throw new Error(
            "EuropaCraft V10: config.js must load before europacraft-ocean.js"
        );
    }


    if (!U) {
        throw new Error(
            "EuropaCraft V10: europacraft-utils.js must load before europacraft-ocean.js"
        );
    }


    /* ================================================================
       HELPERS
    ================================================================ */

    function finite(
        value,
        fallback = 0
    ) {

        const number =
            Number(value);

        return (
            Number.isFinite(number)
                ? number
                : fallback
        );
    }


    function climateWeights(
        latitude,
        longitude,
        landFraction,
        altitudeM
    ) {

        if (
            !global.EuropaClimate ||
            typeof global.EuropaClimate.getClimate !==
                "function"
        ) {

            return null;
        }


        try {

            return global.EuropaClimate.getClimate(
                latitude,
                longitude,
                {
                    landFraction,
                    altitudeM
                }
            ).normalized;
        }
        catch (error) {

            return null;
        }
    }


    function weight(
        normalized,
        name
    ) {

        if (!normalized) {
            return 0;
        }


        return (
            Math.max(
                0,
                finite(
                    normalized[
                        name
                    ],
                    0
                )
            ) /
            100
        );
    }


    /* ================================================================
       BASIN CHARACTERISTICS
    ================================================================ */

    function basinCharacteristics(
        latitude,
        longitude,
        normalized
    ) {

        const atlantic =
            weight(
                normalized,
                "Atlantic"
            );


        const polarMaritime =
            weight(
                normalized,
                "Polar Maritime"
            );


        const arcticMaritime =
            weight(
                normalized,
                "Arctic Maritime"
            );


        const northSea =
            weight(
                normalized,
                "North Sea"
            );


        const baltic =
            weight(
                normalized,
                "Baltic Maritime"
            );


        const mediterranean =
            weight(
                normalized,
                "Mediterranean"
            );


        const blackSea =
            weight(
                normalized,
                "Black Sea"
            );


        const caspian =
            weight(
                normalized,
                "Caspian Maritime"
            );


        /*
         * Thermal inertia:
         *
         * 1.0+ = deep/open ocean.
         * <1.0 = increasingly responsive enclosed/shallow water.
         */

        let thermalInertia =
            1.0;


        thermalInertia +=
            atlantic *
            0.25;


        thermalInertia +=
            polarMaritime *
            0.12;


        thermalInertia -=
            northSea *
            0.18;


        thermalInertia -=
            mediterranean *
            0.22;


        thermalInertia -=
            baltic *
            0.48;


        thermalInertia -=
            blackSea *
            0.43;


        thermalInertia -=
            caspian *
            0.50;


        thermalInertia =
            U.clamp(
                thermalInertia,
                0.42,
                1.35
            );


        /*
         * Enclosed seas have considerably larger annual SST cycles.
         */

        let seasonalAmplitudeMultiplier =
            1;


        seasonalAmplitudeMultiplier +=
            northSea *
            0.20;


        seasonalAmplitudeMultiplier +=
            mediterranean *
            0.18;


        seasonalAmplitudeMultiplier +=
            baltic *
            0.72;


        seasonalAmplitudeMultiplier +=
            blackSea *
            0.62;


        seasonalAmplitudeMultiplier +=
            caspian *
            0.78;


        seasonalAmplitudeMultiplier -=
            atlantic *
            0.16;


        seasonalAmplitudeMultiplier =
            U.clamp(
                seasonalAmplitudeMultiplier,
                0.70,
                1.85
            );


        /*
         * Basin mean-temperature offsets.
         */

        const meanOffsetC =
            atlantic *
                0.5 +
            polarMaritime *
                -0.8 +
            arcticMaritime *
                -3.5 +
            northSea *
                0.2 +
            mediterranean *
                4.6 +
            baltic *
                -1.4 +
            blackSea *
                2.4 +
            caspian *
                1.3;


        /*
         * Enclosed seas tend to reach maximum SST slightly later than
         * land temperatures.
         */

        const seasonalLagDays =
            8 +
            northSea *
                5 +
            mediterranean *
                12 +
            baltic *
                15 +
            blackSea *
                16 +
            caspian *
                18;


        return {

            atlantic,

            polarMaritime,

            arcticMaritime,

            northSea,

            baltic,

            mediterranean,

            blackSea,

            caspian,

            thermalInertia,

            seasonalAmplitudeMultiplier,

            meanOffsetC,

            seasonalLagDays
        };
    }


    /* ================================================================
       SEASONAL SST TARGET
    ================================================================ */

    function seasonalTargetSST(
        latitude,
        longitude,
        date,
        characteristics = null
    ) {

        const day =
            U.dayOfYearUTC(
                date
            );


        const absoluteLatitude =
            Math.abs(
                latitude
            );


        /*
         * Broad European-ocean annual mean.
         *
         * Approximate examples before regional adjustment:
         *
         * 35 N  ~19 C
         * 45 N  ~15 C
         * 55 N  ~11 C
         * 65 N  ~7 C
         * 72 N  ~4 C
         */

        let annualMean =
            19.2 -
            0.40 *
            Math.max(
                0,
                absoluteLatitude -
                35
            );


        /*
         * Northwest Atlantic warmth relative to latitude, representing
         * the broad North Atlantic Current influence rather than any
         * literal ocean-current simulation.
         */

        const northAtlanticCurrent =
            U.gaussian(
                U.haversineKm(
                    latitude,
                    longitude,
                    55,
                    -15
                ),
                1900
            ) *
            U.smoothstep(
                43,
                66,
                latitude
            );


        annualMean +=
            northAtlanticCurrent *
            2.2;


        /*
         * High Arctic suppression.
         */

        annualMean -=
            U.smoothstep(
                67,
                74,
                latitude
            ) *
            2.2;


        if (
            characteristics
        ) {

            annualMean +=
                characteristics.meanOffsetC;
        }


        /*
         * Base annual SST amplitude increases with latitude.
         */

        let amplitude =
            2.7 +
            0.105 *
            Math.max(
                0,
                absoluteLatitude -
                35
            );


        if (
            characteristics
        ) {

            amplitude *=
                characteristics.seasonalAmplitudeMultiplier;
        }


        amplitude =
            U.clamp(
                amplitude,
                2.0,
                10.5
            );


        /*
         * SST peak:
         *
         * open ocean approximately August,
         * enclosed seas somewhat later depending on basin inertia.
         */

        const peakDay =
            220 +
            (
                characteristics
                    ? characteristics.seasonalLagDays
                    : 8
            );


        const seasonal =
            amplitude *
            Math.cos(
                2 *
                Math.PI *
                (
                    day -
                    peakDay
                ) /
                365.2422
            );


        /*
         * Additional Mediterranean south/east warmth.
         */

        let geographicAdjustment =
            0;


        if (
            latitude <
                45 &&
            longitude >
                -6
        ) {

            geographicAdjustment +=
                U.smoothstep(
                    45,
                    33,
                    latitude
                ) *
                1.0;
        }


        /*
         * Very northern waters remain constrained close to freezing
         * during the cold season.
         */

        let target =
            annualMean +
            seasonal +
            geographicAdjustment;


        if (
            latitude >
                69 &&
            (
                day <
                    120 ||
                day >
                    305
            )
        ) {

            target =
                Math.min(
                    target,
                    2.0
                );
        }


        return U.clamp(
            target,
            C.ocean.minSstC,
            C.ocean.maxSstC
        );
    }


    /* ================================================================
       OCEAN STATE
    ================================================================ */

    class Ocean {

        constructor(
            terrain,
            date
        ) {

            if (!terrain) {

                throw new Error(
                    "EuropaCraft V10 Ocean requires terrain."
                );
            }


            this.terrain =
                terrain;


            this.n =
                terrain.n;


            this.nx =
                terrain.nx;


            this.ny =
                terrain.ny;


            /*
             * Prognostic sea-surface temperature.
             */

            this.sst =
                new Float32Array(
                    this.n
                );


            /*
             * Current slowly varying climatological/seasonal target.
             */

            this.targetSst =
                new Float32Array(
                    this.n
                );


            /*
             * Thermal inertia multiplier for each cell.
             */

            this.thermalInertia =
                new Float32Array(
                    this.n
                );


            /*
             * Diagnostics.
             */

            this.airSeaTemperatureDifference =
                new Float32Array(
                    this.n
                );


            this.sstTendencyCPerHour =
                new Float32Array(
                    this.n
                );


            /*
             * Cached basin parameters.
             */

            this.characteristics =
                new Array(
                    this.n
                );


            this.lastTargetDay =
                -1;


            this.initialize(
                date instanceof Date
                    ? date
                    : new Date(date)
            );
        }


        /* ============================================================
           INITIALISATION
        ============================================================ */

        initialize(
            date
        ) {

            for (
                let cell = 0;
                cell < this.n;
                cell++
            ) {

                const latitude =
                    this.terrain.lat[
                        cell
                    ];


                const longitude =
                    this.terrain.lon[
                        cell
                    ];


                const landFraction =
                    U.clamp01(
                        this.terrain.land[
                            cell
                        ]
                    );


                const altitude =
                    Math.max(
                        0,
                        this.terrain.altitudeM[
                            cell
                        ]
                    );


                const normalized =
                    climateWeights(
                        latitude,
                        longitude,
                        landFraction,
                        altitude
                    );


                const characteristics =
                    basinCharacteristics(
                        latitude,
                        longitude,
                        normalized
                    );


                this.characteristics[
                    cell
                ] =
                    characteristics;


                this.thermalInertia[
                    cell
                ] =
                    characteristics.thermalInertia;


                const target =
                    seasonalTargetSST(
                        latitude,
                        longitude,
                        date,
                        characteristics
                    );


                this.targetSst[
                    cell
                ] =
                    target;


                /*
                 * Water cells begin at seasonal equilibrium.
                 *
                 * Land values are retained numerically to keep interpolation
                 * stable near coastlines, but they are not physically used
                 * as SST.
                 */

                this.sst[
                    cell
                ] =
                    target;


                this.airSeaTemperatureDifference[
                    cell
                ] =
                    0;


                this.sstTendencyCPerHour[
                    cell
                ] =
                    0;
            }


            this.lastTargetDay =
                U.dayOfYearUTC(
                    date
                );
        }


        /* ============================================================
           UPDATE SEASONAL TARGET
        ============================================================ */

        updateSeasonalTargets(
            date,
            force = false
        ) {

            const day =
                U.dayOfYearUTC(
                    date
                );


            if (
                !force &&
                day ===
                    this.lastTargetDay
            ) {

                return;
            }


            for (
                let cell = 0;
                cell < this.n;
                cell++
            ) {

                this.targetSst[
                    cell
                ] =
                    seasonalTargetSST(
                        this.terrain.lat[
                            cell
                        ],
                        this.terrain.lon[
                            cell
                        ],
                        date,
                        this.characteristics[
                            cell
                        ]
                    );
            }


            this.lastTargetDay =
                day;
        }


        /* ============================================================
           SST EVOLUTION
        ============================================================ */

        step(
            date,
            airTemperature,
            windU,
            windV,
            dtHours
        ) {

            const hours =
                Math.max(
                    0,
                    finite(
                        dtHours,
                        0
                    )
                );


            if (
                hours <= 0
            ) {
                return;
            }


            this.updateSeasonalTargets(
                date
            );


            for (
                let cell = 0;
                cell < this.n;
                cell++
            ) {

                /*
                 * Only actual water cells evolve as ocean.
                 */

                if (
                    this.terrain.land[
                        cell
                    ] >
                    0.55
                ) {

                    this.sstTendencyCPerHour[
                        cell
                    ] =
                        0;

                    continue;
                }


                const currentSst =
                    this.sst[
                        cell
                    ];


                const target =
                    this.targetSst[
                        cell
                    ];


                const airTemp =
                    finite(
                        airTemperature[
                            cell
                        ],
                        currentSst
                    );


                const u =
                    finite(
                        windU[
                            cell
                        ],
                        0
                    );


                const v =
                    finite(
                        windV[
                            cell
                        ],
                        0
                    );


                const windSpeed =
                    Math.hypot(
                        u,
                        v
                    );


                const inertia =
                    Math.max(
                        0.35,
                        this.thermalInertia[
                            cell
                        ]
                    );


                const airSeaDifference =
                    airTemp -
                    currentSst;


                this.airSeaTemperatureDifference[
                    cell
                ] =
                    -airSeaDifference;


                /*
                 * ====================================================
                 * SEASONAL / CLIMATOLOGICAL RESTORING
                 * ====================================================
                 *
                 * This is intentionally slow.
                 *
                 * Low-inertia enclosed seas respond faster than the deep
                 * Atlantic.
                 */

                const seasonalTendency =
                    (
                        target -
                        currentSst
                    ) *
                    C.ocean.seasonalRelaxationPerHour /
                    inertia;


                /*
                 * ====================================================
                 * ATMOSPHERIC HEAT EXCHANGE
                 * ====================================================
                 *
                 * The atmospheric physics uses
                 * C.ocean.airSeaHeatExchangePerHour for the AIR response.
                 *
                 * Ocean response must be much weaker because the mixed
                 * water layer has far greater heat capacity than the
                 * overlying atmosphere.
                 */

                const windExchange =
                    1 +
                    C.ocean.windHeatExchangeBoost *
                    Math.min(
                        windSpeed,
                        35
                    );


                const mixedLayerResponse =
                    C.ocean.airSeaHeatExchangePerHour *
                    0.022 /
                    inertia;


                let atmosphericTendency =
                    airSeaDifference *
                    mixedLayerResponse *
                    windExchange;


                /*
                 * Prevent transient extreme air from moving SST by
                 * unrealistic amounts in a single hour.
                 */

                atmosphericTendency =
                    U.clamp(
                        atmosphericTendency,
                        -0.12,
                        0.12
                    );


                /*
                 * ====================================================
                 * NET SST TENDENCY
                 * ====================================================
                 */

                let tendency =
                    seasonalTendency +
                    atmosphericTendency;


                /*
                 * Shallow/enclosed seas may respond substantially faster
                 * than the Atlantic, but SST must still evolve on realistic
                 * multi-day timescales.
                 */

                tendency =
                    U.clamp(
                        tendency,
                        -0.16,
                        0.16
                    );


                let nextSst =
                    currentSst +
                    tendency *
                    hours;


                /*
                 * Numerical and physical bounds.
                 */

                nextSst =
                    U.clamp(
                        nextSst,
                        C.ocean.minSstC,
                        C.ocean.maxSstC
                    );


                this.sst[
                    cell
                ] =
                    nextSst;


                this.sstTendencyCPerHour[
                    cell
                ] =
                    tendency;
            }
        }


        /* ============================================================
           SAMPLE
        ============================================================ */

        sample(
            latitude,
            longitude
        ) {

            const terrainSample =
                this.terrain.sample(
                    latitude,
                    longitude
                );


            /*
             * SST is undefined over inland land.
             */

            if (
                terrainSample.landFraction >
                0.65
            ) {

                return NaN;
            }


            return this.terrain.sampleArray(
                this.sst,
                latitude,
                longitude
            );
        }


        sampleTarget(
            latitude,
            longitude
        ) {

            return this.terrain.sampleArray(
                this.targetSst,
                latitude,
                longitude
            );
        }


        /* ============================================================
           DIAGNOSTICS
        ============================================================ */

        diagnosticsAtIndex(
            cell
        ) {

            if (
                cell < 0 ||
                cell >= this.n
            ) {
                return null;
            }


            return {

                sstC:
                    this.sst[
                        cell
                    ],

                seasonalTargetC:
                    this.targetSst[
                        cell
                    ],

                tendencyCPerHour:
                    this.sstTendencyCPerHour[
                        cell
                    ],

                airMinusSeaC:
                    -this.airSeaTemperatureDifference[
                        cell
                    ],

                seaMinusAirC:
                    this.airSeaTemperatureDifference[
                        cell
                    ],

                thermalInertia:
                    this.thermalInertia[
                        cell
                    ],

                landFraction:
                    this.terrain.land[
                        cell
                    ]
            };
        }


        diagnosticsAt(
            latitude,
            longitude
        ) {

            const position =
                this.terrain.xyFromLatLon(
                    latitude,
                    longitude
                );


            const x =
                Math.round(
                    position.x
                );


            const y =
                Math.round(
                    position.y
                );


            const cell =
                y *
                this.nx +
                x;


            return this.diagnosticsAtIndex(
                cell
            );
        }


        /* ============================================================
           VALIDATION
        ============================================================ */

        validate() {

            U.assertFiniteArray(
                this.sst,
                "ocean SST"
            );


            U.assertFiniteArray(
                this.targetSst,
                "ocean seasonal target"
            );


            U.assertFiniteArray(
                this.thermalInertia,
                "ocean thermal inertia"
            );


            return true;
        }
    }


    /* ================================================================
       EXPORT
    ================================================================ */

    global.EuropaOcean =
        Object.freeze({

            Ocean,

            seasonalTargetSST,

            basinCharacteristics
        });

})(window);
