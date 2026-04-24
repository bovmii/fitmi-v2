// WidgetBridgePlugin.m
//
// Bootstraps the WidgetBridge Swift class so Capacitor can see it.
// Same directory as WidgetBridge.swift. Add both to the App target
// in Xcode.

#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(WidgetBridge, "WidgetBridge",
    CAP_PLUGIN_METHOD(update, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(readPending, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(clearPending, CAPPluginReturnPromise);
)
