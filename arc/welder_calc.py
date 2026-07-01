#!/usr/bin/env python3
"""GORWELD™ — kalkulator wkładu ciepła (Heat Input) dla spawacza."""


def heat_input(volts, amps, travel_speed_mm_min, efficiency=0.8):
    """Heat Input w kJ/mm."""
    if travel_speed_mm_min == 0:
        return "Travel speed nie może być zerowy!"
    hi = (volts * amps * 60) / (travel_speed_mm_min * 1000) * efficiency
    return round(hi, 3)


AMP_TABLES = {
    "MMA": {(1, 3): 60, (3, 6): 90, (6, 10): 130, (10, 15): 170},
    "MIG": {(1, 3): 80, (3, 6): 140, (6, 12): 200},
    "TIG": {(1, 2): 45, (2, 4): 70, (4, 6): 100, (6, 10): 140},
}

VOLT_TABLES = {
    "MMA": {(1, 3): 20, (3, 6): 22, (6, 10): 24, (10, 15): 26},
    "MIG": {(1, 3): 18, (3, 6): 22, (6, 12): 26},
    "TIG": {(1, 2): 11, (2, 4): 12, (4, 6): 13, (6, 10): 14},
}

EFFICIENCY = {"MMA": 0.8, "MIG": 0.85, "TIG": 0.6}
POS_AMP_MUL = {"flat": 1.0, "horizontal": 0.95, "vertical": 0.85, "overhead": 0.80}


def recommended_amps(process, thickness_mm, position="flat"):
    table = AMP_TABLES.get(process, {})
    for (min_t, max_t), amp in table.items():
        if min_t <= thickness_mm <= max_t:
            return round(amp * POS_AMP_MUL.get(position, 1.0))
    return "Brak danych – sprawdź tabelę"


def recommended_volts(process, thickness_mm):
    table = VOLT_TABLES.get(process, {})
    for (min_t, max_t), volts in table.items():
        if min_t <= thickness_mm <= max_t:
            return volts
    return None


if __name__ == "__main__":
    print("=== KALKULATOR SPAWACZA GorWeld ===")
    process = "MMA"
    thickness = 8.0
    amps = recommended_amps(process, thickness)
    volts = recommended_volts(process, thickness)
    print(f"Rekomendowany prąd dla {process} {thickness}mm: {amps} A")
    print(f"Rekomendowane napięcie: {volts} V")

    travel = 250  # mm/min
    hi = heat_input(volts, amps, travel)
    print(f"Heat Input @ {travel} mm/min: {hi} kJ/mm")

    # Arc Welder: 8mm MMA → ~2.3 mm/s = 138 mm/min
    travel_game = 2.3 * 60
    hi_game = heat_input(volts, amps, travel_game)
    print(f"Heat Input @ {travel_game:.0f} mm/min (2.3 mm/s z gry): {hi_game} kJ/mm")