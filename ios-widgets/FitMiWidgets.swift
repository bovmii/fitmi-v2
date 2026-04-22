// FitMiWidgets.swift
//
// SwiftUI widgets for the fit.mi home-screen bundle. All six widgets
// read from the shared App Group UserDefaults (group.com.bovmii.fitmi)
// that the JS bridge writes to.
//
// To integrate:
//   1. In Xcode → File → New → Target → Widget Extension → name
//      "FitMiWidgets" (product name matters). Language Swift.
//      Include Configuration Intent: No. Include Live Activity: No.
//   2. On both the App and the FitMiWidgets targets: Signing &
//      Capabilities → +Capability → App Groups → create
//      `group.com.bovmii.fitmi`.
//   3. Replace the generated FitMiWidgets.swift with this file.
//   4. Build → Run → long-press the home screen → Add Widget →
//      fit.mi.

import WidgetKit
import SwiftUI

// MARK: - Shared Defaults

private let suiteName = "group.com.bovmii.fitmi"
private let appURL = URL(string: "fitmi://open")!

private func shared() -> UserDefaults {
    UserDefaults(suiteName: suiteName) ?? .standard
}

// MARK: - Palette

private let bgDark = Color(red: 0.039, green: 0.039, blue: 0.039)
private let accent = Color(red: 0.769, green: 0.659, blue: 0.478)
private let textLight = Color(red: 0.961, green: 0.949, blue: 0.925)
private let muted = Color(white: 0.55)

// =========================================================
// 1 — Hydration (small)
// =========================================================

struct HydrationEntry: TimelineEntry {
    let date: Date
    let current: Int
    let target: Int
}

struct HydrationProvider: TimelineProvider {
    func placeholder(in context: Context) -> HydrationEntry {
        HydrationEntry(date: Date(), current: 4, target: 8)
    }
    func getSnapshot(in context: Context, completion: @escaping (HydrationEntry) -> Void) {
        completion(read())
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<HydrationEntry>) -> Void) {
        let entry = read()
        completion(Timeline(entries: [entry], policy: .atEnd))
    }
    private func read() -> HydrationEntry {
        let data = shared().dictionary(forKey: "water") as? [String: Any]
        let current = (data?["current"] as? Int) ?? 0
        let target = (data?["target"] as? Int) ?? 8
        return HydrationEntry(date: Date(), current: current, target: target)
    }
}

struct HydrationView: View {
    let entry: HydrationEntry
    var body: some View {
        let pct = entry.target > 0 ? Double(entry.current) / Double(entry.target) : 0
        ZStack {
            Circle()
                .stroke(muted.opacity(0.25), lineWidth: 10)
                .padding(16)
            Circle()
                .trim(from: 0, to: pct)
                .stroke(accent, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .padding(16)
            VStack(spacing: 2) {
                Text("\(entry.current)/\(entry.target)")
                    .font(.system(.title3, design: .rounded).weight(.bold))
                    .foregroundColor(textLight)
                Text("verres").font(.caption2).foregroundColor(muted)
            }
        }
        .containerBackground(bgDark, for: .widget)
        .widgetURL(URL(string: "fitmi://water"))
    }
}

struct HydrationWidget: Widget {
    let kind: String = "HydrationWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: HydrationProvider()) { entry in
            HydrationView(entry: entry)
        }
        .configurationDisplayName("Hydratation")
        .description("Ton compteur d'eau du jour.")
        .supportedFamilies([.systemSmall])
    }
}

// =========================================================
// 2 — Calories remaining (small)
// =========================================================

struct CaloriesEntry: TimelineEntry {
    let date: Date
    let consumed: Int
    let target: Int
}

struct CaloriesProvider: TimelineProvider {
    func placeholder(in context: Context) -> CaloriesEntry {
        CaloriesEntry(date: Date(), consumed: 1520, target: 2200)
    }
    func getSnapshot(in context: Context, completion: @escaping (CaloriesEntry) -> Void) { completion(read()) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<CaloriesEntry>) -> Void) {
        completion(Timeline(entries: [read()], policy: .atEnd))
    }
    private func read() -> CaloriesEntry {
        let data = shared().dictionary(forKey: "calories") as? [String: Any]
        let consumed = (data?["consumed"] as? Int) ?? 0
        let target = (data?["target"] as? Int) ?? 0
        return CaloriesEntry(date: Date(), consumed: consumed, target: target)
    }
}

struct CaloriesView: View {
    let entry: CaloriesEntry
    var body: some View {
        let remaining = max(0, entry.target - entry.consumed)
        let pct = entry.target > 0 ? Double(entry.consumed) / Double(entry.target) : 0
        VStack(alignment: .leading, spacing: 6) {
            Text("Calories")
                .font(.caption.weight(.semibold))
                .foregroundColor(muted)
            Text("\(remaining)")
                .font(.system(size: 38, weight: .heavy, design: .rounded))
                .foregroundColor(textLight)
            Text("restantes").font(.caption2).foregroundColor(muted)
            Spacer()
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(muted.opacity(0.25)).frame(height: 4)
                    Capsule().fill(accent).frame(width: geo.size.width * min(pct, 1), height: 4)
                }
            }.frame(height: 4)
        }
        .padding(12)
        .containerBackground(bgDark, for: .widget)
        .widgetURL(URL(string: "fitmi://nutrition"))
    }
}

struct CaloriesWidget: Widget {
    let kind: String = "CaloriesWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: CaloriesProvider()) { entry in
            CaloriesView(entry: entry)
        }
        .configurationDisplayName("Calories restantes")
        .description("Objectif calorique du jour.")
        .supportedFamilies([.systemSmall])
    }
}

// =========================================================
// 3 — Habits (medium)
// =========================================================

struct HabitItem: Identifiable {
    var id: String
    var name: String
    var color: String
    var done: Bool
}

struct HabitsEntry: TimelineEntry {
    let date: Date
    let habits: [HabitItem]
}

struct HabitsProvider: TimelineProvider {
    func placeholder(in context: Context) -> HabitsEntry {
        HabitsEntry(date: Date(), habits: [
            HabitItem(id: "a", name: "Eau", color: "#3b82f6", done: true),
            HabitItem(id: "b", name: "Sport", color: "#10b981", done: false),
        ])
    }
    func getSnapshot(in context: Context, completion: @escaping (HabitsEntry) -> Void) { completion(read()) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<HabitsEntry>) -> Void) {
        completion(Timeline(entries: [read()], policy: .atEnd))
    }
    private func read() -> HabitsEntry {
        let raw = shared().array(forKey: "habits") as? [[String: Any]] ?? []
        let items = raw.prefix(6).map { dict -> HabitItem in
            HabitItem(
                id: (dict["id"] as? String) ?? UUID().uuidString,
                name: (dict["name"] as? String) ?? "",
                color: (dict["color"] as? String) ?? "#c4a87a",
                done: (dict["done"] as? Bool) ?? false
            )
        }
        return HabitsEntry(date: Date(), habits: Array(items))
    }
}

struct HabitsView: View {
    let entry: HabitsEntry
    var body: some View {
        let columns = Array(repeating: GridItem(.flexible()), count: 3)
        VStack(alignment: .leading, spacing: 6) {
            Text("Habitudes").font(.caption.weight(.semibold)).foregroundColor(muted)
            LazyVGrid(columns: columns, spacing: 8) {
                ForEach(entry.habits) { habit in
                    VStack(spacing: 2) {
                        Circle()
                            .fill(habit.done ? Color(hex: habit.color) : Color.clear)
                            .overlay(Circle().stroke(Color(hex: habit.color), lineWidth: 2))
                            .frame(width: 26, height: 26)
                        Text(habit.name)
                            .font(.system(size: 9))
                            .foregroundColor(textLight)
                            .lineLimit(1)
                    }
                }
            }
        }
        .padding(12)
        .containerBackground(bgDark, for: .widget)
        .widgetURL(URL(string: "fitmi://today"))
    }
}

struct HabitsWidget: Widget {
    let kind: String = "HabitsWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: HabitsProvider()) { entry in
            HabitsView(entry: entry)
        }
        .configurationDisplayName("Habitudes")
        .description("Tes habitudes du jour.")
        .supportedFamilies([.systemMedium])
    }
}

// =========================================================
// 4 — Shopping list (medium)
// =========================================================

struct ShopEntry: TimelineEntry {
    let date: Date
    let items: [(name: String, done: Bool)]
}

struct ShopProvider: TimelineProvider {
    func placeholder(in context: Context) -> ShopEntry {
        ShopEntry(date: Date(), items: [("Tomates", false), ("Pain", true), ("Yaourts", false)])
    }
    func getSnapshot(in context: Context, completion: @escaping (ShopEntry) -> Void) { completion(read()) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<ShopEntry>) -> Void) {
        completion(Timeline(entries: [read()], policy: .atEnd))
    }
    private func read() -> ShopEntry {
        let raw = shared().array(forKey: "shopping") as? [[String: Any]] ?? []
        let items = raw.prefix(5).map { dict in
            (name: (dict["name"] as? String) ?? "—", done: (dict["done"] as? Bool) ?? false)
        }
        return ShopEntry(date: Date(), items: Array(items))
    }
}

struct ShopView: View {
    let entry: ShopEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Courses").font(.caption.weight(.semibold)).foregroundColor(muted)
            if entry.items.isEmpty {
                Text("Liste vide").font(.footnote).foregroundColor(muted)
            } else {
                ForEach(Array(entry.items.enumerated()), id: \.offset) { _, item in
                    HStack(spacing: 6) {
                        Image(systemName: item.done ? "checkmark.circle.fill" : "circle")
                            .foregroundColor(item.done ? accent : muted)
                            .font(.caption2)
                        Text(item.name)
                            .font(.caption)
                            .strikethrough(item.done)
                            .foregroundColor(item.done ? muted : textLight)
                            .lineLimit(1)
                    }
                }
            }
        }
        .padding(12)
        .containerBackground(bgDark, for: .widget)
        .widgetURL(URL(string: "fitmi://shopping"))
    }
}

struct ShopWidget: Widget {
    let kind: String = "ShopWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: ShopProvider()) { entry in
            ShopView(entry: entry)
        }
        .configurationDisplayName("Courses")
        .description("Articles à acheter cette semaine.")
        .supportedFamilies([.systemMedium])
    }
}

// =========================================================
// 5 — Budget (small)
// =========================================================

struct BudgetEntry: TimelineEntry {
    let date: Date
    let remaining: Int
    let total: Int
}

struct BudgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> BudgetEntry {
        BudgetEntry(date: Date(), remaining: 680, total: 1500)
    }
    func getSnapshot(in context: Context, completion: @escaping (BudgetEntry) -> Void) { completion(read()) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<BudgetEntry>) -> Void) {
        completion(Timeline(entries: [read()], policy: .atEnd))
    }
    private func read() -> BudgetEntry {
        let data = shared().dictionary(forKey: "budget") as? [String: Any]
        let remaining = (data?["monthlyRemaining"] as? Int) ?? 0
        let total = (data?["monthlyTotal"] as? Int) ?? 0
        return BudgetEntry(date: Date(), remaining: remaining, total: total)
    }
}

struct BudgetView: View {
    let entry: BudgetEntry
    var body: some View {
        let used = max(0, entry.total - entry.remaining)
        let pct = entry.total > 0 ? min(1.0, Double(used) / Double(entry.total)) : 0
        VStack(alignment: .leading, spacing: 6) {
            Text("Reste ce mois").font(.caption.weight(.semibold)).foregroundColor(muted)
            Text("\(entry.remaining) €")
                .font(.system(size: 32, weight: .heavy, design: .rounded))
                .foregroundColor(textLight)
            Text("sur \(entry.total) €").font(.caption2).foregroundColor(muted)
            Spacer()
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(muted.opacity(0.25)).frame(height: 4)
                    Capsule().fill(accent).frame(width: geo.size.width * pct, height: 4)
                }
            }.frame(height: 4)
        }
        .padding(12)
        .containerBackground(bgDark, for: .widget)
        .widgetURL(URL(string: "fitmi://budget"))
    }
}

struct BudgetWidget: Widget {
    let kind: String = "BudgetWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: BudgetProvider()) { entry in
            BudgetView(entry: entry)
        }
        .configurationDisplayName("Budget")
        .description("Ce qu'il te reste ce mois.")
        .supportedFamilies([.systemSmall])
    }
}

// =========================================================
// 6 — Next meal (medium)
// =========================================================

struct MealEntry: TimelineEntry {
    let date: Date
    let slot: String
    let name: String
    let kcal: Int
}

struct MealProvider: TimelineProvider {
    func placeholder(in context: Context) -> MealEntry {
        MealEntry(date: Date(), slot: "Déjeuner", name: "Poulet riz courgettes", kcal: 650)
    }
    func getSnapshot(in context: Context, completion: @escaping (MealEntry) -> Void) { completion(read()) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<MealEntry>) -> Void) {
        completion(Timeline(entries: [read()], policy: .atEnd))
    }
    private func read() -> MealEntry {
        let data = shared().dictionary(forKey: "nextMeal") as? [String: Any]
        return MealEntry(
            date: Date(),
            slot: (data?["slot"] as? String) ?? "",
            name: (data?["name"] as? String) ?? "—",
            kcal: (data?["kcal"] as? Int) ?? 0
        )
    }
}

struct MealView: View {
    let entry: MealEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Prochain repas").font(.caption.weight(.semibold)).foregroundColor(muted)
            if !entry.slot.isEmpty {
                Text(entry.slot.uppercased())
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(accent)
            }
            Text(entry.name)
                .font(.system(.headline, design: .rounded).weight(.bold))
                .foregroundColor(textLight)
                .lineLimit(2)
            Spacer()
            if entry.kcal > 0 {
                Text("≈ \(entry.kcal) kcal").font(.caption).foregroundColor(muted)
            }
        }
        .padding(12)
        .containerBackground(bgDark, for: .widget)
        .widgetURL(URL(string: "fitmi://nutrition"))
    }
}

struct MealWidget: Widget {
    let kind: String = "MealWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: MealProvider()) { entry in
            MealView(entry: entry)
        }
        .configurationDisplayName("Prochain repas")
        .description("Ton prochain repas planifié.")
        .supportedFamilies([.systemMedium])
    }
}

// =========================================================
// Bundle
// =========================================================

@main
struct FitMiWidgets: WidgetBundle {
    var body: some Widget {
        HydrationWidget()
        CaloriesWidget()
        HabitsWidget()
        ShopWidget()
        BudgetWidget()
        MealWidget()
    }
}

// MARK: - hex color helper

extension Color {
    init(hex: String) {
        let s = hex.trimmingCharacters(in: .alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: s).scanHexInt64(&int)
        let r = Double((int & 0xFF0000) >> 16) / 255.0
        let g = Double((int & 0x00FF00) >> 8) / 255.0
        let b = Double(int & 0x0000FF) / 255.0
        self.init(red: r, green: g, blue: b)
    }
}
