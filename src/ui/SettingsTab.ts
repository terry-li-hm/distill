import { App, PluginSettingTab, Setting } from "obsidian";
import type DistillPlugin from "../main";
import { DRAFTER_MODELS, CRITIC_MODELS } from "../settings";

export class DistillSettingsTab extends PluginSettingTab {
  plugin: DistillPlugin;

  constructor(app: App, plugin: DistillPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Distill Settings" });

    // API Configuration
    containerEl.createEl("h3", { text: "API Configuration" });

    new Setting(containerEl)
      .setName("OpenRouter API Key")
      .setDesc("Your OpenRouter API key for accessing AI models")
      .addText((text) =>
        text
          .setPlaceholder("sk-or-...")
          .setValue(this.plugin.settings.openRouterApiKey)
          .onChange(async (value) => {
            this.plugin.settings.openRouterApiKey = value;
            await this.plugin.saveSettings();
          })
      )
      .then((setting) => {
        // Make it a password field
        const inputEl = setting.controlEl.querySelector("input");
        if (inputEl) {
          inputEl.type = "password";
        }
      });

    // Model Selection
    containerEl.createEl("h3", { text: "Model Selection" });

    new Setting(containerEl)
      .setName("Drafter Model")
      .setDesc("Model used for drafting atomic notes (GPT recommended for smoother output)")
      .addDropdown((dropdown) => {
        for (const model of DRAFTER_MODELS) {
          dropdown.addOption(model.id, model.name);
        }
        dropdown.setValue(this.plugin.settings.drafterModel);
        dropdown.onChange(async (value) => {
          this.plugin.settings.drafterModel = value;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Critic Model")
      .setDesc("Model used for critiquing and refining notes (Claude recommended for sharper editing)")
      .addDropdown((dropdown) => {
        for (const model of CRITIC_MODELS) {
          dropdown.addOption(model.id, model.name);
        }
        dropdown.setValue(this.plugin.settings.criticModel);
        dropdown.onChange(async (value) => {
          this.plugin.settings.criticModel = value;
          await this.plugin.saveSettings();
        });
      });

    // Dialogue Settings
    containerEl.createEl("h3", { text: "Dialogue Settings" });

    new Setting(containerEl)
      .setName("Max Interpretation Rounds")
      .setDesc("Maximum rounds for both models to align their interpretations (1-5)")
      .addSlider((slider) =>
        slider
          .setLimits(1, 5, 1)
          .setValue(this.plugin.settings.maxInterpretationRounds)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxInterpretationRounds = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Max Refinement Rounds")
      .setDesc("Maximum rounds of draft-critique-revise cycles (1-5)")
      .addSlider((slider) =>
        slider
          .setLimits(1, 5, 1)
          .setValue(this.plugin.settings.maxRefinementRounds)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.maxRefinementRounds = value;
            await this.plugin.saveSettings();
          })
      );

    // Output Settings
    containerEl.createEl("h3", { text: "Output Settings" });

    new Setting(containerEl)
      .setName("Inbox Note Path")
      .setDesc("Path to the note where atomic notes will be appended")
      .addText((text) =>
        text
          .setPlaceholder("Inbox.md")
          .setValue(this.plugin.settings.inboxPath)
          .onChange(async (value) => {
            this.plugin.settings.inboxPath = value || "Inbox.md";
            await this.plugin.saveSettings();
          })
      );

    // Help Section
    containerEl.createEl("h3", { text: "Help" });

    const helpDiv = containerEl.createDiv({ cls: "distill-help" });
    helpDiv.createEl("p", {
      text: "Distill extracts atomic notes from web articles through a structured dialogue between ChatGPT (drafter) and Claude (critic).",
    });
    helpDiv.createEl("p", {
      text: "Get your OpenRouter API key at: https://openrouter.ai/keys",
    });
  }
}
