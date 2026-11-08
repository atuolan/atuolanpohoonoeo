#!/usr/bin/env ruby
# 看螢幕模式：把新的 Swift 檔加進 Xcode 專案。可以重跑（已經加過就跳過）。
#
#   gem install xcodeproj
#   ruby scripts/ios/add-screen-watch-files.rb
#
# - Shared/ScreenWatchShared.swift：App 和擴充元件都要編
# - App/ScreenWatchPlugin.swift：只有 App 要編

require "xcodeproj"

ROOT = File.expand_path("../..", __dir__)
PROJECT_PATH = File.join(ROOT, "ios/App/App.xcodeproj")

project = Xcodeproj::Project.open(PROJECT_PATH)
app_target = project.targets.find { |t| t.name == "App" } or abort "找不到 App target"
ext_target = project.targets.find { |t| t.name == "ScreenWatchBroadcast" } or abort "找不到 ScreenWatchBroadcast target"

def find_or_create_group(project, name)
  group = project.main_group.children.find { |g| g.display_name == name && g.isa == "PBXGroup" }
  return group if group

  group = project.main_group.new_group(name, name)
  group.set_source_tree("<group>")
  group
end

def add_file(group, file_name, targets)
  ref = group.files.find { |f| f.path == file_name } || group.new_reference(file_name)
  targets.each do |target|
    next if target.source_build_phase.files_references.include?(ref)

    target.add_file_references([ref])
    puts "加入 #{group.display_name}/#{file_name} → #{target.name}"
  end
end

shared_group = find_or_create_group(project, "Shared")
add_file(shared_group, "ScreenWatchShared.swift", [app_target, ext_target])

app_group = project.main_group.children.find { |g| g.display_name == "App" && g.isa == "PBXGroup" } or abort "找不到 App 群組"
add_file(app_group, "ScreenWatchPlugin.swift", [app_target])

project.save
puts "完成"
