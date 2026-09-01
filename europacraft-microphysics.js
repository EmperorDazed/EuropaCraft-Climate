/*
 * EuropaCraft Atmospheric Simulation
 * V10 Microphysics Engine
 *
 * NEW FILE
 *
 * Physical chain:
 *
 *   water vapour
 *       ↓ saturation / forced ascent
 *   condensation / deposition
 *       ↓
 *   persistent cloud liquid + cloud ice
 *       ↓ autoconversion / accretion
 *   falling precipitation
 *       ↓ evaporation / sublimation below cloud
 *   surface precipitation
 *       ↓
 *   rain / sleet / wet snow / snow
 *
 *
 * IMPORTANT DESIGN RULES
 * ================================================================
 *
 * 1. Precipitation is NOT randomly generated.
 *
 * 2. Cloud condensate persists between physics steps.
 *
 * 3. Water is removed from vapour when cloud forms.
 *
 * 4. Water is removed from cloud when precipitation forms.
 *
 * 5. Falling precipitation can evaporate into dry lower air.
 *
 * 6. Evaporation cools the lower atmosphere.
 *
 * 7. Condensation produces latent heating.
 *
 * 8. Precipitation phase uses the vertical thermal profile:
 *
 *       surface
 *       925 hPa
 *       850 hPa
 *       700 hPa
 *
 *    Surface temperature alone is NOT sufficient.
 *
 * 9. The precipitation sanity floor is only permitted when:
 *
 *       meaningful ascent exists
 *       atmosphere is almost saturated
 *       cloud condensate already exists
 *       calculated precipitation is inexplicably near zero
 *
 *    It therefore fixes a numerical/model inconsistency rather than
 *    painting artificial rain.
 */

(function (global) {
    "use strict";


    const C =
        global.EuropaConfig;

    const U =
        global.EuropaUtils;

    const A =
        global.EuropaAtmosphere;


    if (!C) {
        throw new Error(
            "EuropaCraft V10: config.js must load before europacraft-microphysics.js"
        );
    }


    if (!U) {
        throw new Error(
            "EuropaCraft V10: europacraft-utils.js must load before europacraft-microphysics.js"
        );
    }


    if (!A) {
        throw new Error(
            "EuropaCraft V10: europacraft-atmosphere.js must load before europacraft-microphysics.js"
        );
    }


    const PHASE =
        A.PRECIPITATION_PHASE;

    const REASON =
        A.PRECIPITATION_REASON;


    /*
     * Approximate pressure thickness represented by each V10 layer.
     *
     * This allows cloud mixing ratio converted to precipitation to be
     * translated into physically meaningful kg m-2 / mm.
     *
     * 1 kg of water per square metre = 1 mm precipitation.
     */

    const LAYER_DEPTH_HPA =
        Object.freeze([
            75,     // surface -> approximately 925
            75,     // 925 -> 850
            150,    // 850 -> 700
            150     // representative 700-hPa cloud layer
        ]);


    const GRAVITY =
        U.constants.GRAVITY;

    const CP =
        U.constants.CP;

    const LV =
        U.constants.LATENT_HEAT_VAPORIZATION;

    const LF =
        U.constants.LATENT_HEAT_FUSION;


    /* ================================================================
       BASIC HELPERS
    ================================================================ */

    function clampFinite(
        value,
        minimum,
        maximum,
        fallback = 0
    ) {

        const number =
            Number(value);


        if (
            !Number.isFinite(number)
        ) {
            return U.clamp(
                fallback,
                minimum,
                maximum
            );
        }


        return U.clamp(
            number,
            minimum,
            maximum
        );
    }


    function columnMassKgM2(
        levelIndex
    ) {

        const pressureDepthPa =
            LAYER_DEPTH_HPA[
                levelIndex
            ] *
            100;


        return (
            pressureDepthPa /
            GRAVITY
        );
    }


    function condensateToRateMmHr(
        removedKgKg,
        levelIndex,
        dtHours
    ) {

        if (
            dtHours <= 0 ||
            removedKgKg <= 0
        ) {
            return 0;
        }


        const waterKgM2 =
            removedKgKg *
            columnMassKgM2(
                levelIndex
            );


        return (
            waterKgM2 /
            dtHours
        );
    }


    function precipitationAmountToSpecificHumidity(
        amountMm,
        levelIndex
    ) {

        if (
            amountMm <= 0
        ) {
            return 0;
        }


        return (
            amountMm /
            columnMassKgM2(
                levelIndex
            )
        );
    }


    /* ================================================================
       LIQUID / ICE PARTITION
    ================================================================ */

    function liquidFractionAtTemperature(
        temperatureC
    ) {

        /*
         * > +1 C:
         * essentially all cloud liquid.
         *
         * < -15 C:
         * cloud condensate increasingly represented as ice.
         *
         * Mixed-phase cloud persists through the broad range between.
         */

        if (
            temperatureC >= 1
        ) {
            return 1;
        }


        if (
            temperatureC <= -15
        ) {
            return 0.03;
        }


        return U.smootherstep(
            -15,
            1,
            temperatureC
        );
    }


    function iceFractionAtTemperature(
        temperatureC
    ) {

        return (
            1 -
            liquidFractionAtTemperature(
                temperatureC
            )
        );
    }


    /* ================================================================
       CLOUD PHASE ADJUSTMENT
    ================================================================ */

    function adjustCloudPhase(
        level,
        cell,
        dtHours
    ) {

        const temperature =
            level.tempC[
                cell
            ];


        let liquid =
            Math.max(
                0,
                level.cloudLiquid[
                    cell
                ]
            );


        let ice =
            Math.max(
                0,
                level.cloudIce[
                    cell
                ]
            );


        const total =
            liquid +
            ice;


        if (
            total <= 1e-12
        ) {

            level.cloudLiquid[
                cell
            ] = 0;

            level.cloudIce[
                cell
            ] = 0;

            return;
        }


        const desiredLiquidFraction =
            liquidFractionAtTemperature(
                temperature
            );


        const desiredLiquid =
            total *
            desiredLiquidFraction;


        /*
         * Phase conversion is finite rather than instantaneous.
         * This lets mixed-phase cloud genuinely persist.
         */

        const adjustment =
            U.clamp01(
                (
                    0.30 +
                    0.12 *
                    Math.abs(
                        temperature
                    )
                ) *
                dtHours
            );


        const previousLiquid =
            liquid;


        liquid =
            U.lerp(
                liquid,
                desiredLiquid,
                adjustment
            );


        ice =
            total -
            liquid;


        /*
         * Freezing releases latent heat.
         */

        const newlyFrozen =
            Math.max(
                0,
                previousLiquid -
                liquid
            );


        if (
            newlyFrozen >
            0
        ) {

            level.tempC[
                cell
            ] +=
                (
                    newlyFrozen *
                    LF /
                    CP
                ) *
                0.55;
        }


        level.cloudLiquid[
            cell
        ] =
            U.clamp(
                liquid,
                0,
                C.limits.cloudWaterMaxKgKg
            );


        level.cloudIce[
            cell
        ] =
            U.clamp(
                ice,
                0,
                C.limits.cloudIceMaxKgKg
            );
    }


    /* ================================================================
       CONDENSATION AND CLOUD EVAPORATION
    ================================================================ */

    function processCondensationAtLevel(
        atmosphere,
        level,
        levelIndex,
        cell,
        dtHours,
        ascentStrength
    ) {

        const pressure =
            atmosphere.pressureAt(
                levelIndex,
                cell
            );


        let temperature =
            level.tempC[
                cell
            ];


        let q =
            Math.max(
                0,
                level.q[
                    cell
                ]
            );


        let liquid =
            Math.max(
                0,
                level.cloudLiquid[
                    cell
                ]
            );


        let ice =
            Math.max(
                0,
                level.cloudIce[
                    cell
                ]
            );


        const qsat =
            U.qsatFromTempPressure(
                temperature,
                pressure
            );


        let rh =
            qsat > 1e-10
                ? q / qsat
                : 0;


        /*
         * ============================================================
         * SATURATION TARGET
         *
         * Full supersaturation always condenses.
         *
         * Strong ascent permits sub-grid saturated parcels to form cloud
         * slightly below grid-mean 100% RH.
         *
         * This is important in a browser-scale grid where an entire cell
         * cannot realistically be required to reach precisely 100% RH
         * before any cloud can exist.
         * ============================================================
         */

        const ascent =
            Math.max(
                0,
                ascentStrength
            );


        const forcedSaturationReduction =
            U.clamp(
                ascent *
                0.035,
                0,
                0.08
            );


        const targetRH =
            U.clamp(
                1 -
                forcedSaturationReduction,
                C.moisture.cloudFormationRH,
                1
            );


        const targetQ =
            qsat *
            targetRH;


        let condensed =
            0;


        if (
            q >
            qsat
        ) {

            /*
             * Real supersaturation.
             */

            const supersaturated =
                q -
                qsat;


            const efficiency =
                U.clamp01(
                    C.moisture.condensationEfficiency *
                    (
                        0.70 +
                        0.30 *
                        Math.min(
                            1,
                            dtHours *
                            4
                        )
                    )
                );


            condensed =
                Math.min(
                    q,
                    supersaturated *
                    efficiency
                );
        }
        else if (
            ascent >
                C.verticalMotion.meaningfulAscentThreshold &&
            rh >=
                C.moisture.nearSaturationRH &&
            q >
                targetQ
        ) {

            /*
             * Forced sub-grid condensation in ascending nearly saturated
             * air.
             */

            const condensable =
                q -
                targetQ;


            const ascentFactor =
                U.clamp01(
                    ascent /
                    1.2
                );


            condensed =
                condensable *
                C.moisture.forcedLiftCondensationEfficiency *
                (
                    0.35 +
                    0.65 *
                    ascentFactor
                ) *
                Math.min(
                    1,
                    dtHours *
                    3
                );
        }


        condensed =
            U.clamp(
                condensed,
                0,
                q
            );


        if (
            condensed >
            0
        ) {

            q -=
                condensed;


            const liquidFraction =
                liquidFractionAtTemperature(
                    temperature
                );


            const liquidAddition =
                condensed *
                liquidFraction;


            const iceAddition =
                condensed -
                liquidAddition;


            liquid +=
                liquidAddition;


            ice +=
                iceAddition;


            /*
             * Latent heating from vapour condensation/deposition.
             *
             * 0.0001 kg/kg condensation gives roughly a few tenths of a
             * degree, which is physically meaningful without producing
             * runaway warming.
             */

            temperature +=
                (
                    condensed *
                    LV /
                    CP
                ) *
                C.moisture.latentHeatStrength;
        }


        /*
         * ============================================================
         * CLOUD EVAPORATION / SUBLIMATION
         * ============================================================
         */

        const newQsat =
            U.qsatFromTempPressure(
                temperature,
                pressure
            );


        rh =
            newQsat > 1e-10
                ? q / newQsat
                : 0;


        let evaporated =
            0;


        if (
            rh <
                C.moisture.cloudFormationRH &&
            (
                liquid >
                    1e-10 ||
                ice >
                    1e-10
            )
        ) {

            const humidityDeficit =
                Math.max(
                    0,
                    C.moisture.cloudFormationRH -
                    rh
                );


            const vapourCapacity =
                Math.max(
                    0,
                    newQsat -
                    q
                );


            /*
             * Liquid evaporates faster than ice sublimates.
             */

            const liquidPossible =
                Math.min(
                    liquid,
                    vapourCapacity
                );


            const liquidEvaporation =
                liquidPossible *
                C.moisture.evaporationEfficiency *
                humidityDeficit *
                6 *
                dtHours;


            liquid -=
                liquidEvaporation;


            q +=
                liquidEvaporation;


            evaporated +=
                liquidEvaporation;


            const remainingCapacity =
                Math.max(
                    0,
                    newQsat -
                    q
                );


            const icePossible =
                Math.min(
                    ice,
                    remainingCapacity
                );


            const iceSublimation =
                icePossible *
                C.moisture.sublimationEfficiency *
                humidityDeficit *
                5 *
                dtHours;


            ice -=
                iceSublimation;


            q +=
                iceSublimation;


            evaporated +=
                iceSublimation;


            /*
             * Evaporative cooling.
             */

            temperature -=
                (
                    evaporated *
                    LV /
                    CP
                );
        }


        level.tempC[
            cell
        ] =
            U.clamp(
                temperature,
                C.limits.temperatureMinC,
                C.limits.temperatureMaxC
            );


        level.q[
            cell
        ] =
            U.clamp(
                q,
                0,
                C.limits.specificHumidityMaxKgKg
            );


        level.cloudLiquid[
            cell
        ] =
            U.clamp(
                liquid,
                0,
                C.limits.cloudWaterMaxKgKg
            );


        level.cloudIce[
            cell
        ] =
            U.clamp(
                ice,
                0,
                C.limits.cloudIceMaxKgKg
            );


        return {

            condensed,

            evaporated
        };
    }


    /* ================================================================
       PRECIPITATION PRODUCTION
    ================================================================ */

    function autoconvertAtLevel(
        atmosphere,
        level,
        levelIndex,
        cell,
        dtHours,
        forcing
    ) {

        let liquid =
            Math.max(
                0,
                level.cloudLiquid[
                    cell
                ]
            );


        let ice =
            Math.max(
                0,
                level.cloudIce[
                    cell
                ]
            );


        const liquidExcess =
            Math.max(
                0,
                liquid -
                C.cloud.liquidAutoconversionKgKg
            );


        const iceExcess =
            Math.max(
                0,
                ice -
                C.cloud.iceAutoconversionKgKg
            );


        const condensate =
            liquid +
            ice;


        if (
            condensate <=
                1e-10 ||
            (
                liquidExcess <= 0 &&
                iceExcess <= 0
            )
        ) {

            return {
                removedKgKg: 0,
                rateMmHr: 0
            };
        }


        /*
         * Base autoconversion.
         */

        let conversionRateKgKgPerHour =
            liquidExcess *
                C.cloud.liquidAutoconversionRate +
            iceExcess *
                C.cloud.iceAutoconversionRate;


        /*
         * Accretion becomes increasingly important once a cloud already
         * contains substantial condensate.
         */

        const accretionFactor =
            U.clamp01(
                condensate /
                0.0015
            );


        conversionRateKgKgPerHour +=
            (
                liquidExcess +
                iceExcess
            ) *
            C.cloud.accretionRate *
            accretionFactor;


        /*
         * Dynamical precipitation enhancement.
         *
         * This does NOT create water. It only accelerates conversion of
         * existing cloud condensate into precipitation.
         */

        const forcingMultiplier =
            1 +
            forcing.frontal *
                C.precipitation.frontalEfficiency *
                0.55 +
            forcing.orographic *
                C.precipitation.orographicEfficiency *
                0.45 +
            forcing.convective *
                C.precipitation.convectiveEfficiency *
                0.65;


        conversionRateKgKgPerHour *=
            U.clamp(
                forcingMultiplier,
                1,
                4
            );


        let removed =
            conversionRateKgKgPerHour *
            dtHours;


        removed =
            Math.min(
                condensate *
                0.75,
                removed
            );


        if (
            removed <= 0
        ) {

            return {
                removedKgKg: 0,
                rateMmHr: 0
            };
        }


        /*
         * Remove liquid and ice proportionally.
         */

        const liquidShare =
            condensate > 0
                ? liquid / condensate
                : 0;


        const liquidRemoved =
            removed *
            liquidShare;


        const iceRemoved =
            removed -
            liquidRemoved;


        liquid =
            Math.max(
                0,
                liquid -
                liquidRemoved
            );


        ice =
            Math.max(
                0,
                ice -
                iceRemoved
            );


        level.cloudLiquid[
            cell
        ] =
            liquid;


        level.cloudIce[
            cell
        ] =
            ice;


        return {

            removedKgKg:
                removed,

            rateMmHr:
                condensateToRateMmHr(
                    removed,
                    levelIndex,
                    dtHours
                )
        };
    }


    /* ================================================================
       PRECIPITATION REASON
    ================================================================ */

    function determineReason(
        atmosphere,
        cell,
        productionRate,
        sanityFloorUsed
    ) {

        if (
            sanityFloorUsed
        ) {
            return REASON.SANITY_FLOOR;
        }


        if (
            productionRate <=
            0.0001
        ) {
            return REASON.NONE;
        }


        const frontal =
            Math.max(
                0,
                atmosphere.frontalLift[
                    cell
                ]
            );


        const orographic =
            Math.max(
                0,
                atmosphere.orographicLift[
                    cell
                ]
            );


        const convective =
            Math.max(
                0,
                atmosphere.convectiveLift[
                    cell
                ]
            );


        const total =
            frontal +
            orographic +
            convective;


        if (
            total <=
            0.05
        ) {
            return REASON.SATURATION;
        }


        const maximum =
            Math.max(
                frontal,
                orographic,
                convective
            );


        if (
            maximum /
            Math.max(
                0.0001,
                total
            ) <
            0.58
        ) {
            return REASON.MIXED_FORCING;
        }


        if (
            maximum ===
            frontal
        ) {
            return REASON.FRONTAL;
        }


        if (
            maximum ===
            orographic
        ) {
            return REASON.OROGRAPHIC;
        }


        return REASON.CONVECTIVE;
    }


    /* ================================================================
       SANITY FLOOR
    ================================================================ */

    function applySanityFloor(
        atmosphere,
        cell,
        dtHours,
        currentRate
    ) {

        const rule =
            C.precipitation.sanityFloor;


        if (
            !rule.enabled ||
            currentRate >=
                rule.minimumRateMmHr
        ) {

            return {
                rateMmHr:
                    currentRate,

                used:
                    false
            };
        }


        const ascent =
            Math.max(
                atmosphere.totalLift[
                    cell
                ],
                atmosphere.surface.w[
                    cell
                ],
                atmosphere.level925.w[
                    cell
                ],
                atmosphere.level850.w[
                    cell
                ]
            );


        if (
            ascent <
            rule.minimumVerticalMotion
        ) {

            return {
                rateMmHr:
                    currentRate,

                used:
                    false
            };
        }


        /*
         * Find the most saturated cloudy layer.
         */

        let bestLevelIndex =
            -1;

        let bestRH =
            -Infinity;

        let bestCondensate =
            0;


        for (
            let levelIndex = 0;
            levelIndex < atmosphere.levels.length;
            levelIndex++
        ) {

            const level =
                atmosphere.levels[
                    levelIndex
                ];


            const rh =
                level.relativeHumidity[
                    cell
                ];


            const condensate =
                level.cloudLiquid[
                    cell
                ] +
                level.cloudIce[
                    cell
                ];


            if (
                rh >=
                    rule.minimumRH &&
                condensate >=
                    rule.minimumCondensateKgKg &&
                rh >
                    bestRH
            ) {

                bestRH =
                    rh;

                bestCondensate =
                    condensate;

                bestLevelIndex =
                    levelIndex;
            }
        }


        if (
            bestLevelIndex <
            0
        ) {

            return {
                rateMmHr:
                    currentRate,

                used:
                    false
            };
        }


        const requiredAdditionalRate =
            Math.max(
                0,
                rule.minimumRateMmHr -
                currentRate
            );


        const requiredAmountMm =
            requiredAdditionalRate *
            dtHours;


        const requiredKgKg =
            precipitationAmountToSpecificHumidity(
                requiredAmountMm,
                bestLevelIndex
            );


        const level =
            atmosphere.levels[
                bestLevelIndex
            ];


        const removable =
            Math.min(
                requiredKgKg,
                bestCondensate *
                0.25
            );


        if (
            removable <=
            0
        ) {

            return {
                rateMmHr:
                    currentRate,

                used:
                    false
            };
        }


        const totalCondensate =
            level.cloudLiquid[
                cell
            ] +
            level.cloudIce[
                cell
            ];


        const liquidShare =
            totalCondensate > 0
                ? level.cloudLiquid[
                    cell
                ] /
                  totalCondensate
                : 0;


        level.cloudLiquid[
            cell
        ] =
            Math.max(
                0,
                level.cloudLiquid[
                    cell
                ] -
                removable *
                liquidShare
            );


        level.cloudIce[
            cell
        ] =
            Math.max(
                0,
                level.cloudIce[
                    cell
                ] -
                removable *
                (
                    1 -
                    liquidShare
                )
            );


        const actualAddedRate =
            condensateToRateMmHr(
                removable,
                bestLevelIndex,
                dtHours
            );


        return {

            rateMmHr:
                currentRate +
                actualAddedRate,

            used:
                actualAddedRate >
                0
        };
    }


    /* ================================================================
       BELOW-CLOUD EVAPORATION
    ================================================================ */

    function evaporateFallingPrecipitation(
        atmosphere,
        cell,
        rateMmHr,
        dtHours
    ) {

        if (
            rateMmHr <=
            0
        ) {

            return {
                finalRateMmHr: 0,
                evaporatedRateMmHr: 0
            };
        }


        const surface =
            atmosphere.surface;

        const level925 =
            atmosphere.level925;


        const surfaceRH =
            U.clamp01(
                surface.relativeHumidity[
                    cell
                ]
            );


        const rh925 =
            U.clamp01(
                level925.relativeHumidity[
                    cell
                ]
            );


        const lowerRH =
            (
                surfaceRH *
                0.62 +
                rh925 *
                0.38
            );


        const dryness =
            U.clamp01(
                1 -
                lowerRH
            );


        if (
            dryness <=
            0.01
        ) {

            return {
                finalRateMmHr:
                    rateMmHr,

                evaporatedRateMmHr:
                    0
            };
        }


        /*
         * Light precipitation is especially vulnerable to virga.
         * Heavy rain/snow is much harder to evaporate entirely.
         */

        const intensityProtection =
            U.clamp(
                Math.log1p(
                    rateMmHr
                ) /
                Math.log(
                    16
                ),
                0,
                1
            );


        let evaporatedFraction =
            C.precipitation.belowCloudEvaporation *
            dryness *
            (
                1.35 -
                0.75 *
                intensityProtection
            );


        evaporatedFraction =
            U.clamp(
                evaporatedFraction *
                Math.min(
                    1,
                    dtHours *
                    2.5
                ),
                0,
                0.78
            );


        const evaporatedRate =
            rateMmHr *
            evaporatedFraction;


        const evaporatedAmountMm =
            evaporatedRate *
            dtHours;


        /*
         * Return evaporated precipitation to lower-atmosphere vapour.
         */

        const qIncrease =
            precipitationAmountToSpecificHumidity(
                evaporatedAmountMm,
                0
            );


        const actualQIncrease =
            Math.min(
                qIncrease,
                Math.max(
                    0,
                    C.limits.specificHumidityMaxKgKg -
                    surface.q[
                        cell
                    ]
                )
            );


        surface.q[
            cell
        ] +=
            actualQIncrease;


        /*
         * Evaporative cooling.
         */

        surface.tempC[
            cell
        ] -=
            (
                actualQIncrease *
                LV /
                CP
            );


        surface.tempC[
            cell
        ] =
            U.clamp(
                surface.tempC[
                    cell
                ],
                C.limits.temperatureMinC,
                C.limits.temperatureMaxC
            );


        return {

            finalRateMmHr:
                Math.max(
                    0,
                    rateMmHr -
                    evaporatedRate
                ),

            evaporatedRateMmHr:
                evaporatedRate
        };
    }


    /* ================================================================
       PRECIPITATION PHASE
    ================================================================ */

    function calculateEffectiveSurfaceWetBulb(
        atmosphere,
        cell,
        precipitationRate
    ) {

        const surface =
            atmosphere.surface;


        let wetBulb =
            U.wetBulbC(
                surface.tempC[
                    cell
                ],
                atmosphere.pressureHpa[
                    cell
                ],
                surface.q[
                    cell
                ]
            );


        const rh =
            U.clamp01(
                U.relativeHumidity(
                    surface.tempC[
                        cell
                    ],
                    atmosphere.pressureHpa[
                        cell
                    ],
                    surface.q[
                        cell
                    ]
                )
            );


        /*
         * Residual evaporative cooling potential.
         */

        const evaporativeCooling =
            (
                1 -
                rh
            ) *
            C.precipitationPhase.evaporativeCoolingStrength;


        /*
         * Strong ascent can maintain an isothermal near-freezing layer.
         */

        const dynamicCooling =
            U.clamp01(
                atmosphere.totalLift[
                    cell
                ] /
                1.5
            ) *
            C.precipitationPhase.dynamicCoolingStrength;


        /*
         * Sustained moderate/heavy precipitation can lower the melting
         * level through diabatic cooling.
         */

        const precipitationCooling =
            U.clamp(
                Math.log1p(
                    precipitationRate
                ) /
                Math.log(
                    12
                ),
                0,
                1.4
            ) *
            C.precipitationPhase.precipitationCoolingStrength;


        wetBulb -=
            evaporativeCooling +
            dynamicCooling +
            precipitationCooling;


        return wetBulb;
    }


    function determinePhase(
        atmosphere,
        cell,
        precipitationRate
    ) {

        if (
            precipitationRate <=
            0.001
        ) {

            return {

                code:
                    PHASE.DRY,

                rainFraction:
                    0,

                sleetFraction:
                    0,

                wetSnowFraction:
                    0,

                snowFraction:
                    0,

                effectiveWetBulbC:
                    atmosphere.surface.wetBulbC[
                        cell
                    ],

                warmNoseC:
                    0
            };
        }


        const surface =
            atmosphere.surface;

        const l925 =
            atmosphere.level925;

        const l850 =
            atmosphere.level850;

        const l700 =
            atmosphere.level700;


        const twSurface =
            calculateEffectiveSurfaceWetBulb(
                atmosphere,
                cell,
                precipitationRate
            );


        const tw925 =
            U.wetBulbC(
                l925.tempC[
                    cell
                ],
                925,
                l925.q[
                    cell
                ]
            );


        const tw850 =
            U.wetBulbC(
                l850.tempC[
                    cell
                ],
                850,
                l850.q[
                    cell
                ]
            );


        const tw700 =
            U.wetBulbC(
                l700.tempC[
                    cell
                ],
                700,
                l700.q[
                    cell
                ]
            );


        /*
         * Warm nose capable of melting falling snow.
         *
         * Both dry-bulb and wet-bulb matter. A nominally warm but very dry
         * layer can cool substantially once precipitation begins.
         */

        const warmNose =
            Math.max(
                tw925,
                tw850,
                l925.tempC[
                    cell
                ] *
                    0.65 +
                    tw925 *
                    0.35,
                l850.tempC[
                    cell
                ] *
                    0.65 +
                    tw850 *
                    0.35
            );


        const upperIceSupport =
            U.clamp01(
                (
                    1 -
                    U.smoothstep(
                        -4,
                        1,
                        tw700
                    )
                ) *
                0.75 +
                (
                    1 -
                    U.smoothstep(
                        -2,
                        2,
                        tw850
                    )
                ) *
                0.25
            );


        const meltingStrength =
            U.smoothstep(
                C.precipitationPhase.warmNoseMinimumC,
                C.precipitationPhase.strongWarmNoseC,
                warmNose
            );


        /*
         * Base surface thermal transition.
         */

        const snowThermal =
            1 -
            U.smoothstep(
                C.precipitationPhase.definiteSnowWetBulbC,
                C.precipitationPhase.mixedUpperWetBulbC,
                twSurface
            );


        const rainThermal =
            U.smoothstep(
                C.precipitationPhase.wetSnowUpperWetBulbC,
                C.precipitationPhase.definiteRainWetBulbC,
                twSurface
            );


        let snowWeight =
            snowThermal *
            (
                0.45 +
                0.55 *
                upperIceSupport
            ) *
            (
                1 -
                meltingStrength *
                0.92
            );


        let wetSnowWeight =
            (
                1 -
                Math.abs(
                    U.clamp(
                        (
                            twSurface -
                            0.8
                        ) /
                        1.7,
                        -1,
                        1
                    )
                )
            ) *
            (
                0.45 +
                0.55 *
                upperIceSupport
            ) *
            (
                1 -
                meltingStrength *
                0.65
            );


        wetSnowWeight =
            Math.max(
                0,
                wetSnowWeight
            );


        /*
         * Sleet becomes favoured when snow melts partly aloft but the
         * lower atmosphere remains close to or below freezing.
         */

        const lowLevelCold =
            1 -
            U.smoothstep(
                0.0,
                2.2,
                Math.max(
                    twSurface,
                    tw925
                )
            );


        let sleetWeight =
            meltingStrength *
            (
                0.35 +
                0.65 *
                lowLevelCold
            );


        /*
         * Also allow mixed sleet around the ordinary snow/rain boundary
         * even without a pronounced elevated warm nose.
         */

        const transitionSleet =
            1 -
            Math.abs(
                U.clamp(
                    (
                        twSurface -
                        1.7
                    ) /
                    1.7,
                    -1,
                    1
                )
            );


        sleetWeight +=
            Math.max(
                0,
                transitionSleet
            ) *
            0.48;


        let rainWeight =
            rainThermal *
            (
                0.45 +
                0.55 *
                meltingStrength
            );


        /*
         * A strong warm layer should force substantially more melt even
         * if surface wet bulb remains close to zero.
         */

        rainWeight +=
            meltingStrength *
            U.smoothstep(
                -0.5,
                1.5,
                twSurface
            ) *
            0.60;


        /*
         * Deep cold column strongly suppresses rain.
         */

        const deepCold =
            (
                tw925 <=
                    C.precipitationPhase.warmNoseMinimumC &&
                tw850 <=
                    C.precipitationPhase.warmNoseMinimumC
            );


        if (
            deepCold
        ) {

            rainWeight *=
                0.20;

            sleetWeight *=
                0.60;

            snowWeight *=
                1.30;

            wetSnowWeight *=
                1.20;
        }


        /*
         * Strong warm nose suppresses intact snow.
         */

        if (
            warmNose >=
            C.precipitationPhase.strongWarmNoseC
        ) {

            snowWeight *=
                0.08;

            wetSnowWeight *=
                0.38;
        }


        /*
         * Very cold surface layer beneath a warm nose pushes melted
         * precipitation back toward ice pellets / sleet rather than rain.
         */

        if (
            meltingStrength >
                0.45 &&
            twSurface <
                C.precipitationPhase.refreezeLayerC
        ) {

            sleetWeight *=
                1.7;

            rainWeight *=
                0.20;
        }


        snowWeight =
            Math.max(
                0,
                snowWeight
            );

        wetSnowWeight =
            Math.max(
                0,
                wetSnowWeight
            );

        sleetWeight =
            Math.max(
                0,
                sleetWeight
            );

        rainWeight =
            Math.max(
                0,
                rainWeight
            );


        let total =
            snowWeight +
            wetSnowWeight +
            sleetWeight +
            rainWeight;


        /*
         * Numerical fallback only.
         */

        if (
            total <=
            1e-9
        ) {

            if (
                twSurface <=
                C.precipitationPhase.definiteSnowWetBulbC
            ) {
                snowWeight = 1;
            }
            else if (
                twSurface <=
                C.precipitationPhase.wetSnowUpperWetBulbC
            ) {
                wetSnowWeight = 1;
            }
            else if (
                twSurface <=
                C.precipitationPhase.mixedUpperWetBulbC
            ) {
                sleetWeight = 1;
            }
            else {
                rainWeight = 1;
            }


            total =
                1;
        }


        rainWeight /=
            total;

        sleetWeight /=
            total;

        wetSnowWeight /=
            total;

        snowWeight /=
            total;


        const fractions =
            [
                {
                    code:
                        PHASE.RAIN,

                    fraction:
                        rainWeight
                },

                {
                    code:
                        PHASE.SLEET,

                    fraction:
                        sleetWeight
                },

                {
                    code:
                        PHASE.WET_SNOW,

                    fraction:
                        wetSnowWeight
                },

                {
                    code:
                        PHASE.SNOW,

                    fraction:
                        snowWeight
                }
            ];


        fractions.sort(
            (
                a,
                b
            ) =>
                b.fraction -
                a.fraction
        );


        return {

            code:
                fractions[0].code,

            rainFraction:
                rainWeight,

            sleetFraction:
                sleetWeight,

            wetSnowFraction:
                wetSnowWeight,

            snowFraction:
                snowWeight,

            effectiveWetBulbC:
                twSurface,

            wetBulb925C:
                tw925,

            wetBulb850C:
                tw850,

            wetBulb700C:
                tw700,

            warmNoseC:
                warmNose,

            upperIceSupport
        };
    }


    /* ================================================================
       SNOW ACCUMULATION
    ================================================================ */

    function updateSnowAccumulation(
        atmosphere,
        terrain,
        cell,
        phase,
        precipitationRate,
        dtHours
    ) {

        if (
            terrain.land[
                cell
            ] <
            0.5
        ) {
            return;
        }


        if (
            precipitationRate <=
            0
        ) {
            return;
        }


        const snowRate =
            precipitationRate *
            phase.snowFraction;


        const wetSnowRate =
            precipitationRate *
            phase.wetSnowFraction;


        /*
         * A fraction of sleet contributes solid water to the surface,
         * although considerably less depth than snow.
         */

        const sleetSolidRate =
            precipitationRate *
            phase.sleetFraction *
            0.55;


        const solidWaterRate =
            snowRate +
            wetSnowRate +
            sleetSolidRate;


        if (
            solidWaterRate <
            C.snow.minimumAccumulatingRateMmHr
        ) {
            return;
        }


        const waterAmountMm =
            solidWaterRate *
            dtHours;


        atmosphere.snowWaterEquivalentMm[
            cell
        ] +=
            waterAmountMm;


        /*
         * Temperature-dependent snow-to-water ratio.
         */

        const effectiveWetBulb =
            phase.effectiveWetBulbC;


        let ratioCmPerMm;


        if (
            effectiveWetBulb >
            0.4
        ) {

            ratioCmPerMm =
                C.snow.wetSnowRatioCmPerMm;
        }
        else if (
            effectiveWetBulb <
            -5
        ) {

            ratioCmPerMm =
                C.snow.drySnowRatioCmPerMm;
        }
        else {

            const fraction =
                U.smoothstep(
                    -5,
                    0.4,
                    effectiveWetBulb
                );


            ratioCmPerMm =
                U.lerp(
                    C.snow.drySnowRatioCmPerMm,
                    C.snow.normalSnowRatioCmPerMm,
                    fraction
                );
        }


        /*
         * Wet snow receives explicitly denser accumulation.
         */

        const pureSnowDepth =
            snowRate *
            dtHours *
            ratioCmPerMm;


        const wetSnowDepth =
            wetSnowRate *
            dtHours *
            C.snow.wetSnowRatioCmPerMm;


        const sleetDepth =
            sleetSolidRate *
            dtHours *
            0.20;


        atmosphere.snowDepthCm[
            cell
        ] +=
            pureSnowDepth +
            wetSnowDepth +
            sleetDepth;
    }


    /* ================================================================
       GROUND WETTING
    ================================================================ */

    function updateGroundMoisture(
        atmosphere,
        terrain,
        cell,
        phase,
        precipitationRate,
        dtHours
    ) {

        if (
            terrain.land[
                cell
            ] <
            0.5 ||
            precipitationRate <=
            0
        ) {
            return;
        }


        const liquidFraction =
            phase.rainFraction +
            phase.sleetFraction *
                0.65 +
            phase.wetSnowFraction *
                0.20;


        const liquidAmountMm =
            precipitationRate *
            liquidFraction *
            dtHours;


        if (
            liquidAmountMm <=
            0
        ) {
            return;
        }


        atmosphere.groundMoisture[
            cell
        ] =
            U.clamp01(
                atmosphere.groundMoisture[
                    cell
                ] +
                liquidAmountMm *
                C.ground.rainWettingPerMm
            );
    }


    /* ================================================================
       MICROPHYSICS ENGINE
    ================================================================ */

    class Microphysics {

        constructor(
            terrain,
            ocean,
            atmosphere
        ) {

            if (!terrain) {

                throw new Error(
                    "EuropaCraft V10 Microphysics requires terrain."
                );
            }


            if (!atmosphere) {

                throw new Error(
                    "EuropaCraft V10 Microphysics requires atmosphere."
                );
            }


            this.terrain =
                terrain;

            this.ocean =
                ocean;

            this.atmosphere =
                atmosphere;


            this.n =
                terrain.n;


            /*
             * Additional phase diagnostics useful for later debugging/UI.
             */

            this.effectiveWetBulbC =
                new Float32Array(
                    this.n
                );


            this.warmNoseC =
                new Float32Array(
                    this.n
                );


            this.wetBulb925C =
                new Float32Array(
                    this.n
                );


            this.wetBulb850C =
                new Float32Array(
                    this.n
                );


            this.wetBulb700C =
                new Float32Array(
                    this.n
                );
        }


        /* ============================================================
           ASCENT PER LEVEL
        ============================================================ */

        ascentForLevel(
            cell,
            levelIndex
        ) {

            const a =
                this.atmosphere;


            const level =
                a.levels[
                    levelIndex
                ];


            /*
             * The explicit level vertical velocity has priority.
             *
             * totalLift is a dimensionless column-scale ascent measure
             * calculated by the V10 physics engine.
             */

            const levelAscent =
                Math.max(
                    0,
                    level.w[
                        cell
                    ]
                );


            const columnLift =
                Math.max(
                    0,
                    a.totalLift[
                        cell
                    ]
                );


            /*
             * Frontal ascent commonly maximises through the low/middle
             * atmosphere rather than exactly at the ground.
             */

            const columnWeights =
                [
                    0.60,
                    1.00,
                    1.00,
                    0.72
                ];


            return (
                levelAscent +
                columnLift *
                columnWeights[
                    levelIndex
                ]
            );
        }


        /* ============================================================
           ONE CELL
        ============================================================ */

        stepCell(
            cell,
            dtHours
        ) {

            const a =
                this.atmosphere;


            let totalCondensed =
                0;

            let totalCloudEvaporated =
                0;

            let productionRate =
                0;


            /* --------------------------------------------------------
               1. CONDENSATION / EVAPORATION AT EACH LEVEL
            -------------------------------------------------------- */

            for (
                let levelIndex = 0;
                levelIndex < a.levels.length;
                levelIndex++
            ) {

                const level =
                    a.levels[
                        levelIndex
                    ];


                const ascent =
                    this.ascentForLevel(
                        cell,
                        levelIndex
                    );


                const result =
                    processCondensationAtLevel(
                        a,
                        level,
                        levelIndex,
                        cell,
                        dtHours,
                        ascent
                    );


                totalCondensed +=
                    result.condensed;


                totalCloudEvaporated +=
                    result.evaporated;


                adjustCloudPhase(
                    level,
                    cell,
                    dtHours
                );
            }


            /*
             * Update RH after condensation before precipitation production.
             */

            a.updateThermodynamicDiagnosticsAt(
                cell
            );


            /* --------------------------------------------------------
               2. PRECIPITATION PRODUCTION
            -------------------------------------------------------- */

            const forcing = {

                frontal:
                    Math.max(
                        0,
                        a.frontalLift[
                            cell
                        ]
                    ),

                orographic:
                    Math.max(
                        0,
                        a.orographicLift[
                            cell
                        ]
                    ),

                convective:
                    Math.max(
                        0,
                        a.convectiveLift[
                            cell
                        ]
                    )
            };


            for (
                let levelIndex = 0;
                levelIndex < a.levels.length;
                levelIndex++
            ) {

                const level =
                    a.levels[
                        levelIndex
                    ];


                const result =
                    autoconvertAtLevel(
                        a,
                        level,
                        levelIndex,
                        cell,
                        dtHours,
                        forcing
                    );


                productionRate +=
                    result.rateMmHr;
            }


            productionRate =
                U.clamp(
                    productionRate,
                    0,
                    C.precipitation.maximumMmHr
                );


            /* --------------------------------------------------------
               3. PHYSICAL SANITY FLOOR
            -------------------------------------------------------- */

            const sanity =
                applySanityFloor(
                    a,
                    cell,
                    dtHours,
                    productionRate
                );


            productionRate =
                sanity.rateMmHr;


            /* --------------------------------------------------------
               4. BELOW-CLOUD EVAPORATION / VIRGA
            -------------------------------------------------------- */

            const falling =
                evaporateFallingPrecipitation(
                    a,
                    cell,
                    productionRate,
                    dtHours
                );


            let surfaceRate =
                U.clamp(
                    falling.finalRateMmHr,
                    0,
                    C.precipitation.maximumMmHr
                );


            /*
             * Negligible numerical traces are considered dry.
             */

            if (
                surfaceRate <
                0.002
            ) {
                surfaceRate = 0;
            }


            /*
             * Recalculate lower-atmosphere thermodynamics after
             * precipitation evaporation.
             */

            a.updateThermodynamicDiagnosticsAt(
                cell
            );


            /* --------------------------------------------------------
               5. PRECIPITATION PHASE
            -------------------------------------------------------- */

            const phase =
                determinePhase(
                    a,
                    cell,
                    surfaceRate
                );


            this.effectiveWetBulbC[
                cell
            ] =
                phase.effectiveWetBulbC;


            this.warmNoseC[
                cell
            ] =
                phase.warmNoseC ||
                0;


            this.wetBulb925C[
                cell
            ] =
                phase.wetBulb925C ??
                a.level925.wetBulbC[
                    cell
                ];


            this.wetBulb850C[
                cell
            ] =
                phase.wetBulb850C ??
                a.level850.wetBulbC[
                    cell
                ];


            this.wetBulb700C[
                cell
            ] =
                phase.wetBulb700C ??
                a.level700.wetBulbC[
                    cell
                ];


            /* --------------------------------------------------------
               6. WRITE SURFACE PRECIPITATION
            -------------------------------------------------------- */

            a.precipMmHr[
                cell
            ] =
                surfaceRate;


            a.rainMmHr[
                cell
            ] =
                surfaceRate *
                phase.rainFraction;


            a.sleetMmHr[
                cell
            ] =
                surfaceRate *
                phase.sleetFraction;


            a.wetSnowMmHr[
                cell
            ] =
                surfaceRate *
                phase.wetSnowFraction;


            a.snowMmHr[
                cell
            ] =
                surfaceRate *
                phase.snowFraction;


            a.precipitationPhase[
                cell
            ] =
                surfaceRate > 0
                    ? phase.code
                    : PHASE.DRY;


            a.precipitationReason[
                cell
            ] =
                determineReason(
                    a,
                    cell,
                    productionRate,
                    sanity.used
                );


            /* --------------------------------------------------------
               7. DIAGNOSTICS
            -------------------------------------------------------- */

            a.condensationRate[
                cell
            ] =
                dtHours > 0
                    ? totalCondensed /
                      dtHours
                    : 0;


            a.evaporationRate[
                cell
            ] =
                dtHours > 0
                    ? totalCloudEvaporated /
                      dtHours
                    : 0;


            a.precipProduction[
                cell
            ] =
                productionRate;


            a.precipEvaporation[
                cell
            ] =
                falling.evaporatedRateMmHr;


            /* --------------------------------------------------------
               8. SURFACE HYDROLOGY / SNOW
            -------------------------------------------------------- */

            updateGroundMoisture(
                a,
                this.terrain,
                cell,
                phase,
                surfaceRate,
                dtHours
            );


            updateSnowAccumulation(
                a,
                this.terrain,
                cell,
                phase,
                surfaceRate,
                dtHours
            );


            /*
             * Final safety clamps.
             */

            a.surface.tempC[
                cell
            ] =
                U.clamp(
                    a.surface.tempC[
                        cell
                    ],
                    C.limits.temperatureMinC,
                    C.limits.temperatureMaxC
                );


            a.snowDepthCm[
                cell
            ] =
                Math.max(
                    0,
                    a.snowDepthCm[
                        cell
                    ]
                );


            a.snowWaterEquivalentMm[
                cell
            ] =
                Math.max(
                    0,
                    a.snowWaterEquivalentMm[
                        cell
                    ]
                );
        }


        /* ============================================================
           FULL MICROPHYSICS STEP
        ============================================================ */

        step(
            date,
            dtHours
        ) {

            const hours =
                clampFinite(
                    dtHours,
                    0,
                    1,
                    0
                );


            if (
                hours <= 0
            ) {
                return;
            }


            /*
             * Instantaneous precipitation belongs to the current physics
             * step. Persistent cloud condensate is NOT cleared.
             */

            this.atmosphere.clearInstantaneousPrecipitation();


            for (
                let cell = 0;
                cell < this.n;
                cell++
            ) {

                this.stepCell(
                    cell,
                    hours
                );
            }


            this.atmosphere.updateAllThermodynamicDiagnostics();
        }


        /* ============================================================
           DIAGNOSTIC QUERY
        ============================================================ */

        diagnosticsAtIndex(
            cell
        ) {

            const a =
                this.atmosphere;


            const phaseCode =
                a.precipitationPhase[
                    cell
                ];


            const reasonCode =
                a.precipitationReason[
                    cell
                ];


            return {

                precipMmHr:
                    a.precipMmHr[
                        cell
                    ],

                rainMmHr:
                    a.rainMmHr[
                        cell
                    ],

                sleetMmHr:
                    a.sleetMmHr[
                        cell
                    ],

                wetSnowMmHr:
                    a.wetSnowMmHr[
                        cell
                    ],

                snowMmHr:
                    a.snowMmHr[
                        cell
                    ],

                phase:
                    A.PRECIPITATION_PHASE_NAMES[
                        phaseCode
                    ] ||
                    "dry",

                reason:
                    A.PRECIPITATION_REASON_NAMES[
                        reasonCode
                    ] ||
                    "none",

                effectiveWetBulbC:
                    this.effectiveWetBulbC[
                        cell
                    ],

                wetBulb925C:
                    this.wetBulb925C[
                        cell
                    ],

                wetBulb850C:
                    this.wetBulb850C[
                        cell
                    ],

                wetBulb700C:
                    this.wetBulb700C[
                        cell
                    ],

                warmNoseC:
                    this.warmNoseC[
                        cell
                    ],

                condensationKgKgHr:
                    a.condensationRate[
                        cell
                    ],

                cloudEvaporationKgKgHr:
                    a.evaporationRate[
                        cell
                    ],

                precipProductionMmHr:
                    a.precipProduction[
                        cell
                    ],

                precipEvaporationMmHr:
                    a.precipEvaporation[
                        cell
                    ],

                surfaceRH:
                    a.surface.relativeHumidity[
                        cell
                    ],

                rh925:
                    a.level925.relativeHumidity[
                        cell
                    ],

                rh850:
                    a.level850.relativeHumidity[
                        cell
                    ],

                rh700:
                    a.level700.relativeHumidity[
                        cell
                    ],

                surfaceCloudLiquid:
                    a.surface.cloudLiquid[
                        cell
                    ],

                cloudLiquid925:
                    a.level925.cloudLiquid[
                        cell
                    ],

                cloudLiquid850:
                    a.level850.cloudLiquid[
                        cell
                    ],

                cloudLiquid700:
                    a.level700.cloudLiquid[
                        cell
                    ],

                surfaceCloudIce:
                    a.surface.cloudIce[
                        cell
                    ],

                cloudIce925:
                    a.level925.cloudIce[
                        cell
                    ],

                cloudIce850:
                    a.level850.cloudIce[
                        cell
                    ],

                cloudIce700:
                    a.level700.cloudIce[
                        cell
                    ],

                totalLift:
                    a.totalLift[
                        cell
                    ],

                frontalLift:
                    a.frontalLift[
                        cell
                    ],

                orographicLift:
                    a.orographicLift[
                        cell
                    ],

                convectiveLift:
                    a.convectiveLift[
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
                this.terrain.nx +
                x;


            return this.diagnosticsAtIndex(
                cell
            );
        }
    }


    /* ================================================================
       EXPORT
    ================================================================ */

    global.EuropaMicrophysics =
        Object.freeze({

            Microphysics,

            liquidFractionAtTemperature,

            iceFractionAtTemperature,

            determinePhase,

            LAYER_DEPTH_HPA
        });

})(window);
