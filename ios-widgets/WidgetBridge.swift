// WidgetBridge.swift
//
// Capacitor plugin that lets the JS layer drop key/value data into
// the shared App Group UserDefaults and ask WidgetKit to refresh
// every timeline.
//
// Drop this file into ios/App/App/plugins/WidgetBridge/ in Xcode
// and add both .swift files (this + WidgetBridgePlugin.m) to the
// App target. The App Group ID is hard-coded to match the widget
// target.

import Foundation
import Capacitor
import WidgetKit

@objc(WidgetBridge)
public class WidgetBridge: CAPPlugin {
    private let suiteName = "group.com.bovmii.fitmi"

    @objc func update(_ call: CAPPluginCall) {
        guard let data = call.getObject("data") else {
            call.reject("data object required")
            return
        }
        let defaults = UserDefaults(suiteName: suiteName)
        for (key, value) in data {
            defaults?.set(value, forKey: key)
        }
        if #available(iOS 14.0, *) {
            WidgetCenter.shared.reloadAllTimelines()
        }
        call.resolve()
    }
}
