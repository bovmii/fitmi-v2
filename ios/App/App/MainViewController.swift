// MainViewController.swift
//
// Capacitor 8 with SPM no longer auto-discovers custom plugins
// declared via the CAP_PLUGIN macro in the App target. Plugins
// shipped via Swift package products get auto-registered, anything
// else has to be plugged in manually here, in capacitorDidLoad().

import UIKit
import Capacitor

class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WidgetBridge())
    }
}
